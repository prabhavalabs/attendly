// Package auth implements authentication (login/refresh/logout/setup), the
// access/refresh token lifecycle, and RBAC resolution — byte-compatible with
// the previous Worker so existing accounts and tokens keep working.
package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"attendly/api/internal/cryptox"
	"attendly/api/internal/store"
)

const (
	accessTTL  = 15 * time.Minute
	refreshTTL = 30 * 24 * time.Hour

	// dummyHash equalizes verify timing for unknown emails (anti-enumeration).
	dummyHash = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
)

// Role is a role summary attached to the authenticated principal.
type Role struct {
	ID    string `json:"id"`
	Key   string `json:"key"`
	Label string `json:"label"`
}

// User is the authenticated principal with roles and a flattened permission set.
type User struct {
	ID          string              `json:"id"`
	Email       string              `json:"email"`
	Name        string              `json:"name"`
	Status      string              `json:"status"`
	Roles       []Role              `json:"roles"`
	Permissions map[string]struct{} `json:"-"`
}

// Tokens is the token pair returned to clients.
type Tokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    string `json:"expires_at"`
}

// Service carries auth dependencies.
type Service struct {
	db         *sql.DB
	jwtSecret  string
	setupToken string
}

// New constructs the auth service.
func New(db *sql.DB, jwtSecret, setupToken string) *Service {
	return &Service{db: db, jwtSecret: jwtSecret, setupToken: setupToken}
}

// ErrInvalidCredentials / ErrSuspended are sentinel auth failures.
var (
	ErrInvalidCredentials = errors.New("invalid_credentials")
	ErrSuspended          = errors.New("account_suspended")
	ErrInvalidToken       = errors.New("invalid_token")
)

// LoadUser resolves a user with roles + permissions. Local SQLite makes the
// three small reads negligible. Returns (nil, nil) if not found / soft-deleted.
func (s *Service) LoadUser(ctx context.Context, id string) (*User, error) {
	u := &User{Permissions: map[string]struct{}{}}
	err := s.db.QueryRowContext(ctx,
		`SELECT id, email, name, status FROM users WHERE id = ? AND deleted_at IS NULL`, id,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	roleRows, err := s.db.QueryContext(ctx,
		`SELECT r.id, r.key, r.label FROM roles r
		   JOIN user_roles ur ON ur.role_id = r.id
		  WHERE ur.user_id = ? ORDER BY r.label`, id)
	if err != nil {
		return nil, err
	}
	defer roleRows.Close()
	for roleRows.Next() {
		var r Role
		if err := roleRows.Scan(&r.ID, &r.Key, &r.Label); err != nil {
			return nil, err
		}
		u.Roles = append(u.Roles, r)
	}
	if err := roleRows.Err(); err != nil {
		return nil, err
	}

	permRows, err := s.db.QueryContext(ctx,
		`SELECT DISTINCT rp.permission_key FROM role_permissions rp
		   JOIN user_roles ur ON ur.role_id = rp.role_id
		  WHERE ur.user_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer permRows.Close()
	for permRows.Next() {
		var k string
		if err := permRows.Scan(&k); err != nil {
			return nil, err
		}
		u.Permissions[k] = struct{}{}
	}
	return u, permRows.Err()
}

// issueTokens mints an access JWT + a refresh session (only the hash is stored).
func (s *Service) issueTokens(ctx context.Context, userAgent string, id, email, name string) (Tokens, error) {
	now := time.Now()
	exp := now.Add(accessTTL)
	access, err := cryptox.SignJWT(cryptox.Claims{
		Sub: id, Email: email, Name: name, Iat: now.Unix(), Exp: exp.Unix(),
	}, s.jwtSecret)
	if err != nil {
		return Tokens{}, err
	}

	refresh := cryptox.RandomToken(32)
	var ua *string
	if userAgent != "" {
		ua = &userAgent
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO auth_sessions (id, user_id, refresh_token_hash, user_agent, created_at, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		cryptox.NewID("ses"), id, cryptox.SHA256Hex(refresh), ua,
		cryptox.NowISO(), cryptox.ISOAt(now.Add(refreshTTL)),
	); err != nil {
		return Tokens{}, err
	}

	return Tokens{AccessToken: access, RefreshToken: refresh, ExpiresAt: cryptox.ISOAt(exp)}, nil
}

// Login verifies credentials and issues tokens.
func (s *Service) Login(ctx context.Context, email, password, userAgent string) (Tokens, *User, error) {
	var id, name, hash, status string
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, password_hash, status FROM users WHERE email = ? AND deleted_at IS NULL`, email,
	).Scan(&id, &name, &hash, &status)
	if errors.Is(err, sql.ErrNoRows) {
		_ = cryptox.VerifyPassword(password, dummyHash) // equalize timing
		return Tokens{}, nil, ErrInvalidCredentials
	}
	if err != nil {
		return Tokens{}, nil, err
	}
	if !cryptox.VerifyPassword(password, hash) {
		return Tokens{}, nil, ErrInvalidCredentials
	}
	if status != "active" {
		return Tokens{}, nil, ErrSuspended
	}

	tokens, err := s.issueTokens(ctx, userAgent, id, email, name)
	if err != nil {
		return Tokens{}, nil, err
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE users SET last_login_at = ? WHERE id = ?`, cryptox.NowISO(), id)
	actor := id
	_ = store.WriteAudit(ctx, s.db, store.AuditEntry{ActorID: &actor, Action: "auth.login", EntityType: strptr("user"), EntityID: &id})

	user, err := s.LoadUser(ctx, id)
	if err != nil || user == nil {
		return Tokens{}, nil, ErrInvalidCredentials
	}
	return tokens, user, nil
}

// Refresh rotates a refresh session and issues a fresh token pair.
func (s *Service) Refresh(ctx context.Context, refreshToken, userAgent string) (Tokens, *User, error) {
	hash := cryptox.SHA256Hex(refreshToken)
	var sessID, userID, expiresAt string
	var revokedAt sql.NullString
	err := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, expires_at, revoked_at FROM auth_sessions WHERE refresh_token_hash = ?`, hash,
	).Scan(&sessID, &userID, &expiresAt, &revokedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Tokens{}, nil, ErrInvalidToken
	}
	if err != nil {
		return Tokens{}, nil, err
	}
	if revokedAt.Valid || expiresAt <= cryptox.NowISO() {
		return Tokens{}, nil, ErrInvalidToken
	}

	user, err := s.LoadUser(ctx, userID)
	if err != nil {
		return Tokens{}, nil, err
	}
	if user == nil {
		return Tokens{}, nil, ErrInvalidToken
	}
	if user.Status != "active" {
		return Tokens{}, nil, ErrSuspended
	}

	// Rotate: revoke the presented session, mint a new pair.
	if _, err := s.db.ExecContext(ctx, `UPDATE auth_sessions SET revoked_at = ? WHERE id = ?`, cryptox.NowISO(), sessID); err != nil {
		return Tokens{}, nil, err
	}
	tokens, err := s.issueTokens(ctx, userAgent, user.ID, user.Email, user.Name)
	if err != nil {
		return Tokens{}, nil, err
	}
	return tokens, user, nil
}

// Logout revokes the given refresh session for the user (best-effort).
func (s *Service) Logout(ctx context.Context, userID, refreshToken string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE auth_sessions SET revoked_at = ? WHERE refresh_token_hash = ? AND user_id = ? AND revoked_at IS NULL`,
		cryptox.NowISO(), cryptox.SHA256Hex(refreshToken), userID,
	)
	return err
}

func strptr(s string) *string { return &s }
