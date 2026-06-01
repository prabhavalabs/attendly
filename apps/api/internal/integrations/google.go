// Package integrations implements the Google Calendar integration (SRS §7.8):
// OAuth, AES-GCM token storage at rest, and best-effort session→calendar sync.
package integrations

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"attendly/api/internal/cryptox"
)

const (
	authURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	tokenURL    = "https://oauth2.googleapis.com/token"
	userinfoURL = "https://www.googleapis.com/oauth2/v2/userinfo"
	calBase     = "https://www.googleapis.com/calendar/v3"
)

var scopes = []string{
	"https://www.googleapis.com/auth/calendar.events",
	"https://www.googleapis.com/auth/userinfo.email",
}

// Service holds Google integration dependencies.
type Service struct {
	db           *sql.DB
	encKey       string
	clientID     string
	clientSecret string
	http         *http.Client
}

// NewService constructs the Google integration service.
func NewService(db *sql.DB, encKey, clientID, clientSecret string) *Service {
	return &Service{db: db, encKey: encKey, clientID: clientID, clientSecret: clientSecret, http: &http.Client{Timeout: 15 * time.Second}}
}

// Configured reports whether OAuth client credentials are present.
func (s *Service) Configured() bool { return s.clientID != "" }

// Integration is the stored connection status.
type Integration struct {
	ID             string
	AccountEmail   *string
	CalendarID     *string
	TokenExpiresAt *string
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
}

// BuildAuthURL returns the OAuth consent URL (offline + forced consent).
func (s *Service) BuildAuthURL(redirectURI, state string) string {
	p := url.Values{
		"client_id":              {s.clientID},
		"redirect_uri":           {redirectURI},
		"response_type":          {"code"},
		"scope":                  {strings.Join(scopes, " ")},
		"access_type":            {"offline"},
		"include_granted_scopes": {"true"},
		"prompt":                 {"consent"},
		"state":                  {state},
	}
	return authURL + "?" + p.Encode()
}

func (s *Service) postToken(ctx context.Context, form url.Values) (*tokenResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token request failed: %d", res.StatusCode)
	}
	var tr tokenResponse
	if err := json.NewDecoder(res.Body).Decode(&tr); err != nil {
		return nil, err
	}
	return &tr, nil
}

// ExchangeCode swaps an auth code for tokens.
func (s *Service) ExchangeCode(ctx context.Context, code, redirectURI string) (*tokenResponse, error) {
	return s.postToken(ctx, url.Values{
		"code": {code}, "client_id": {s.clientID}, "client_secret": {s.clientSecret},
		"redirect_uri": {redirectURI}, "grant_type": {"authorization_code"},
	})
}

func (s *Service) refresh(ctx context.Context, refreshToken string) (*tokenResponse, error) {
	return s.postToken(ctx, url.Values{
		"refresh_token": {refreshToken}, "client_id": {s.clientID}, "client_secret": {s.clientSecret},
		"grant_type": {"refresh_token"},
	})
}

// FetchUserEmail returns the connected account's email.
func (s *Service) FetchUserEmail(ctx context.Context, accessToken string) (string, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, userinfoURL, nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	res, err := s.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", nil
	}
	var data struct {
		Email string `json:"email"`
	}
	_ = json.NewDecoder(res.Body).Decode(&data)
	return data.Email, nil
}

// Calendar is a writable calendar choice.
type Calendar struct {
	ID      string `json:"id"`
	Summary string `json:"summary"`
	Primary bool   `json:"primary,omitempty"`
}

// ListCalendars returns the account's writable calendars.
func (s *Service) ListCalendars(ctx context.Context, accessToken string) ([]Calendar, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, calBase+"/users/me/calendarList?minAccessRole=writer", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	res, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return []Calendar{}, nil
	}
	var data struct {
		Items []Calendar `json:"items"`
	}
	_ = json.NewDecoder(res.Body).Decode(&data)
	if data.Items == nil {
		return []Calendar{}, nil
	}
	return data.Items, nil
}

// GetIntegration returns the stored connection, or nil.
func (s *Service) GetIntegration(ctx context.Context) (*Integration, error) {
	var it Integration
	var email, cal, exp sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT id, account_email, calendar_id, token_expires_at FROM integration_accounts WHERE provider = 'google'`).
		Scan(&it.ID, &email, &cal, &exp)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	it.AccountEmail = nullStr(email)
	it.CalendarID = nullStr(cal)
	it.TokenExpiresAt = nullStr(exp)
	return &it, nil
}

// SaveConnection upserts tokens (encrypted), preserving a prior refresh token.
func (s *Service) SaveConnection(ctx context.Context, tr *tokenResponse, email string, connectedBy *string) error {
	now := cryptox.NowISO()
	accessEnc, err := cryptox.AESEncrypt(tr.AccessToken, s.encKey)
	if err != nil {
		return err
	}
	var refreshEnc *string
	if tr.RefreshToken != "" {
		enc, err := cryptox.AESEncrypt(tr.RefreshToken, s.encKey)
		if err != nil {
			return err
		}
		refreshEnc = &enc
	}
	expires := cryptox.ISOIn(tr.ExpiresIn)
	var scope *string
	if tr.Scope != "" {
		scope = &tr.Scope
	}
	var emailPtr *string
	if email != "" {
		emailPtr = &email
	}

	existing, err := s.GetIntegration(ctx)
	if err != nil {
		return err
	}
	if existing != nil {
		_, err = s.db.ExecContext(ctx,
			`UPDATE integration_accounts SET account_email = ?, access_token_enc = ?,
			   refresh_token_enc = COALESCE(?, refresh_token_enc), token_expires_at = ?, scope = ?, updated_at = ?
			 WHERE provider = 'google'`,
			emailPtr, accessEnc, refreshEnc, expires, scope, now)
		return err
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO integration_accounts (id, provider, connected_by, account_email, access_token_enc, refresh_token_enc, token_expires_at, scope, created_at, updated_at)
		 VALUES (?, 'google', ?, ?, ?, ?, ?, ?, ?, ?)`,
		cryptox.NewID("int"), connectedBy, emailPtr, accessEnc, refreshEnc, expires, scope, now, now)
	return err
}

// SetCalendar sets the target calendar.
func (s *Service) SetCalendar(ctx context.Context, calendarID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE integration_accounts SET calendar_id = ?, updated_at = ? WHERE provider = 'google'`, calendarID, cryptox.NowISO())
	return err
}

// Disconnect removes the stored connection.
func (s *Service) Disconnect(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM integration_accounts WHERE provider = 'google'`)
	return err
}

// ValidAccessToken returns a usable access token, refreshing near expiry.
func (s *Service) ValidAccessToken(ctx context.Context) (string, error) {
	var accessEnc, refreshEnc, expiresAt sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT access_token_enc, refresh_token_enc, token_expires_at FROM integration_accounts WHERE provider = 'google'`).
		Scan(&accessEnc, &refreshEnc, &expiresAt)
	if err == sql.ErrNoRows || !accessEnc.Valid {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if expiresAt.Valid && expiresAt.String > cryptox.ISOIn(60) {
		tok, _ := cryptox.AESDecrypt(accessEnc.String, s.encKey)
		return tok, nil
	}
	if !refreshEnc.Valid {
		tok, _ := cryptox.AESDecrypt(accessEnc.String, s.encKey)
		return tok, nil
	}
	refresh, ok := cryptox.AESDecrypt(refreshEnc.String, s.encKey)
	if !ok {
		return "", nil
	}
	tr, err := s.refresh(ctx, refresh)
	if err != nil {
		return "", nil // best-effort
	}
	enc, err := cryptox.AESEncrypt(tr.AccessToken, s.encKey)
	if err != nil {
		return "", err
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE integration_accounts SET access_token_enc = ?, token_expires_at = ?, updated_at = ? WHERE provider = 'google'`,
		enc, cryptox.ISOIn(tr.ExpiresIn), cryptox.NowISO())
	return tr.AccessToken, nil
}

// SyncSession pushes a session to Google Calendar (create/update/delete by
// status). Best-effort: failures are swallowed and never block the caller.
func (s *Service) SyncSession(sessionID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_ = s.syncSession(ctx, sessionID)
}

func (s *Service) syncSession(ctx context.Context, sessionID string) error {
	it, err := s.GetIntegration(ctx)
	if err != nil || it == nil || it.CalendarID == nil {
		return err
	}
	accessToken, err := s.ValidAccessToken(ctx)
	if err != nil || accessToken == "" {
		return err
	}

	var date, start, end, status, className string
	var topic, eventID sql.NullString
	err = s.db.QueryRowContext(ctx,
		`SELECT cs.session_date, cs.start_time, cs.end_time, cs.status, cs.topic, cs.gcal_event_id, c.name
		   FROM class_sessions cs JOIN classes c ON c.id = cs.class_id WHERE cs.id = ?`, sessionID).
		Scan(&date, &start, &end, &status, &topic, &eventID, &className)
	if err != nil {
		return err
	}

	calID := url.PathEscape(*it.CalendarID)
	if status == "cancelled" {
		if eventID.Valid {
			req, _ := http.NewRequestWithContext(ctx, http.MethodDelete, calBase+"/calendars/"+calID+"/events/"+url.PathEscape(eventID.String), nil)
			req.Header.Set("Authorization", "Bearer "+accessToken)
			if res, e := s.http.Do(req); e == nil {
				res.Body.Close()
			}
			_, _ = s.db.ExecContext(ctx, `UPDATE class_sessions SET gcal_event_id = NULL WHERE id = ?`, sessionID)
		}
		return nil
	}

	tz := "Asia/Colombo"
	_ = s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = 'timezone'`).Scan(&tz)
	summary := className
	if topic.Valid && topic.String != "" {
		summary = className + " — " + topic.String
	}
	body, _ := json.Marshal(map[string]any{
		"summary": summary,
		"start":   map[string]string{"dateTime": date + "T" + start + ":00", "timeZone": tz},
		"end":     map[string]string{"dateTime": date + "T" + end + ":00", "timeZone": tz},
	})

	if eventID.Valid {
		req, _ := http.NewRequestWithContext(ctx, http.MethodPatch, calBase+"/calendars/"+calID+"/events/"+url.PathEscape(eventID.String), strings.NewReader(string(body)))
		req.Header.Set("Authorization", "Bearer "+accessToken)
		req.Header.Set("Content-Type", "application/json")
		if res, e := s.http.Do(req); e == nil {
			res.Body.Close()
		}
		return nil
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, calBase+"/calendars/"+calID+"/events", strings.NewReader(string(body)))
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	res, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusOK {
		data, _ := io.ReadAll(res.Body)
		var created struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(data, &created)
		if created.ID != "" {
			_, _ = s.db.ExecContext(ctx, `UPDATE class_sessions SET gcal_event_id = ? WHERE id = ?`, created.ID, sessionID)
		}
	}
	return nil
}

func nullStr(n sql.NullString) *string {
	if !n.Valid {
		return nil
	}
	return &n.String
}
