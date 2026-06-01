package auth

import (
	"errors"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/httpapi"
)

// Handlers exposes the auth HTTP endpoints.
type Handlers struct{ svc *Service }

// NewHandlers wires HTTP handlers to the auth service.
func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// MountPublic mounts unauthenticated auth routes (login, refresh).
func (h *Handlers) MountPublic(r chi.Router) {
	r.Method(http.MethodPost, "/login", httpapi.Handler(h.login))
	r.Method(http.MethodPost, "/refresh", httpapi.Handler(h.refresh))
}

// MountAuthed mounts routes requiring a valid access token (logout, me).
func (h *Handlers) MountAuthed(r chi.Router) {
	r.Method(http.MethodPost, "/logout", httpapi.Handler(h.logout))
	r.Method(http.MethodGet, "/me", httpapi.Handler(h.me))
}

func (h *Handlers) login(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if in.Email == "" || in.Password == "" {
		return httpapi.BadRequest("invalid_body")
	}
	tokens, user, err := h.svc.Login(r.Context(), in.Email, in.Password, r.UserAgent())
	if err != nil {
		return mapErr(err)
	}
	httpapi.JSON(w, http.StatusOK, loginResponse{Tokens: tokens, User: toMe(user)})
	return nil
}

func (h *Handlers) refresh(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if in.RefreshToken == "" {
		return httpapi.BadRequest("invalid_body")
	}
	tokens, user, err := h.svc.Refresh(r.Context(), in.RefreshToken, r.UserAgent())
	if err != nil {
		return mapErr(err)
	}
	httpapi.JSON(w, http.StatusOK, loginResponse{Tokens: tokens, User: toMe(user)})
	return nil
}

func (h *Handlers) logout(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if err := h.svc.Logout(r.Context(), MustUser(r.Context()).ID, in.RefreshToken); err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func (h *Handlers) me(w http.ResponseWriter, r *http.Request) error {
	httpapi.JSON(w, http.StatusOK, toMe(MustUser(r.Context())))
	return nil
}

// SetupHandler is mounted separately (it must run before any user exists).
func (h *Handlers) SetupHandler(w http.ResponseWriter, r *http.Request) error {
	var in SetupInput
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Name = strings.TrimSpace(in.Name)
	if in.Email == "" || in.Name == "" || len(in.Password) < 8 {
		return httpapi.BadRequest("invalid_body")
	}
	userID, err := h.svc.Setup(r.Context(), in)
	if err != nil {
		return mapErr(err)
	}
	httpapi.JSON(w, http.StatusCreated, map[string]any{"ok": true, "user_id": userID})
	return nil
}

type meView struct {
	ID          string   `json:"id"`
	Email       string   `json:"email"`
	Name        string   `json:"name"`
	Status      string   `json:"status"`
	Roles       []Role   `json:"roles"`
	Permissions []string `json:"permissions"`
}

type loginResponse struct {
	Tokens Tokens `json:"tokens"`
	User   meView `json:"user"`
}

func toMe(u *User) meView {
	perms := make([]string, 0, len(u.Permissions))
	for k := range u.Permissions {
		perms = append(perms, k)
	}
	sort.Strings(perms)
	roles := u.Roles
	if roles == nil {
		roles = []Role{}
	}
	return meView{ID: u.ID, Email: u.Email, Name: u.Name, Status: u.Status, Roles: roles, Permissions: perms}
}

// mapErr converts auth sentinel errors into HTTP responses.
func mapErr(err error) error {
	switch {
	case errors.Is(err, ErrInvalidCredentials):
		return httpapi.Unauthorized("invalid_credentials")
	case errors.Is(err, ErrInvalidToken):
		return httpapi.Unauthorized("invalid_token")
	case errors.Is(err, ErrSuspended):
		return httpapi.Forbidden("account_suspended")
	case errors.Is(err, ErrSetupCompleted):
		return httpapi.Forbidden("setup_already_completed")
	case errors.Is(err, ErrEmailTaken):
		return httpapi.Conflict("email_taken")
	default:
		return err
	}
}
