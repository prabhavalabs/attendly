package integrations

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/auth"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/store"
)

// Handlers serves the Google integration endpoints.
type Handlers struct {
	svc         *Service
	jwtSecret   string
	adminOrigin string
}

// NewHandlers constructs the integration handlers.
func NewHandlers(svc *Service, jwtSecret, adminOrigin string) *Handlers {
	return &Handlers{svc: svc, jwtSecret: jwtSecret, adminOrigin: adminOrigin}
}

// MountAuthed registers the authenticated routes (integration.manage).
func (h *Handlers) MountAuthed(r chi.Router) {
	manage := auth.RequirePermission("integration.manage")
	r.Route("/api/integrations/google", func(r chi.Router) {
		r.With(manage).Method(http.MethodGet, "/", httpapi.Handler(h.status))
		r.With(manage).Method(http.MethodGet, "/connect", httpapi.Handler(h.connect))
		r.With(manage).Method(http.MethodGet, "/calendars", httpapi.Handler(h.calendars))
		r.With(manage).Method(http.MethodPatch, "/", httpapi.Handler(h.setCalendar))
		r.With(manage).Method(http.MethodPost, "/disconnect", httpapi.Handler(h.disconnect))
	})
}

// MountPublic registers the OAuth callback (no auth — Google redirects here).
func (h *Handlers) MountPublic(r chi.Router) {
	r.Method(http.MethodGet, "/api/integrations/google/callback", httpapi.Handler(h.callback))
}

func (h *Handlers) redirectURI(r *http.Request) string {
	scheme := "http"
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		scheme = proto
	} else if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host + "/api/integrations/google/callback"
}

func (h *Handlers) status(w http.ResponseWriter, r *http.Request) error {
	it, err := h.svc.GetIntegration(r.Context())
	if err != nil {
		return err
	}
	resp := map[string]any{"connected": it != nil, "account_email": nil, "calendar_id": nil}
	if it != nil {
		resp["account_email"] = it.AccountEmail
		resp["calendar_id"] = it.CalendarID
	}
	httpapi.JSON(w, http.StatusOK, resp)
	return nil
}

func (h *Handlers) connect(w http.ResponseWriter, r *http.Request) error {
	if !h.svc.Configured() {
		return httpapi.BadRequest("google_not_configured")
	}
	now := time.Now()
	state, err := cryptox.SignJWT(cryptox.Claims{Sub: "oauth-state", Email: "google", Name: "state", Iat: now.Unix(), Exp: now.Add(10 * time.Minute).Unix()}, h.jwtSecret)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"url": h.svc.BuildAuthURL(h.redirectURI(r), state)})
	return nil
}

func (h *Handlers) callback(w http.ResponseWriter, r *http.Request) error {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	fail := func() error {
		http.Redirect(w, r, h.adminOrigin+"/settings?google=error", http.StatusFound)
		return nil
	}
	if code == "" || state == "" {
		return fail()
	}
	if _, err := cryptox.VerifyJWT(state, h.jwtSecret); err != nil {
		return fail()
	}
	tr, err := h.svc.ExchangeCode(r.Context(), code, h.redirectURI(r))
	if err != nil {
		return fail()
	}
	email, _ := h.svc.FetchUserEmail(r.Context(), tr.AccessToken)
	if err := h.svc.SaveConnection(r.Context(), tr, email, nil); err != nil {
		return fail()
	}
	http.Redirect(w, r, h.adminOrigin+"/settings?google=connected", http.StatusFound)
	return nil
}

func (h *Handlers) calendars(w http.ResponseWriter, r *http.Request) error {
	token, err := h.svc.ValidAccessToken(r.Context())
	if err != nil {
		return err
	}
	if token == "" {
		return httpapi.BadRequest("not_connected")
	}
	cals, err := h.svc.ListCalendars(r.Context(), token)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"calendars": cals})
	return nil
}

func (h *Handlers) setCalendar(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		CalendarID string `json:"calendar_id"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if in.CalendarID == "" {
		return httpapi.BadRequest("invalid_body")
	}
	it, err := h.svc.GetIntegration(r.Context())
	if err != nil {
		return err
	}
	if it == nil {
		return httpapi.BadRequest("not_connected")
	}
	if err := h.svc.SetCalendar(r.Context(), in.CalendarID); err != nil {
		return err
	}
	actor := auth.MustUser(r.Context()).ID
	_ = store.WriteAudit(r.Context(), h.svc.db, store.AuditEntry{ActorID: &actor, Action: "integration.google.set_calendar", EntityType: sp("integration"), After: map[string]any{"calendar_id": in.CalendarID}})
	httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func (h *Handlers) disconnect(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.Disconnect(r.Context()); err != nil {
		return err
	}
	actor := auth.MustUser(r.Context()).ID
	_ = store.WriteAudit(r.Context(), h.svc.db, store.AuditEntry{ActorID: &actor, Action: "integration.google.disconnect", EntityType: sp("integration")})
	httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func sp(s string) *string { return &s }
