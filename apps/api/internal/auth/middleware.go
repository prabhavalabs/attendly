package auth

import (
	"context"
	"net/http"
	"strings"

	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/rbac"
)

type ctxKey int

const userKey ctxKey = iota

// CurrentUser returns the authenticated principal set by Authenticate, if any.
func CurrentUser(ctx context.Context) *User {
	u, _ := ctx.Value(userKey).(*User)
	return u
}

// MustUser returns the principal or panics — only call inside authenticated
// routes (after Authenticate). Recovered by the server's recover middleware.
func MustUser(ctx context.Context) *User {
	u := CurrentUser(ctx)
	if u == nil {
		panic("auth: no user in context")
	}
	return u
}

// Authenticate verifies the Bearer token and resolves the principal onto the
// request context, or responds 401.
func (s *Service) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			httpapi.JSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
			return
		}
		claims, err := cryptox.VerifyJWT(strings.TrimPrefix(header, "Bearer "), s.jwtSecret)
		if err != nil {
			httpapi.JSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid_token"})
			return
		}
		user, err := s.LoadUser(r.Context(), claims.Sub)
		if err != nil {
			httpapi.JSON(w, http.StatusInternalServerError, map[string]any{"error": "internal_error"})
			return
		}
		if user == nil {
			httpapi.JSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid_token"})
			return
		}
		if user.Status != "active" {
			httpapi.JSON(w, http.StatusForbidden, map[string]any{"error": "account_suspended"})
			return
		}
		ctx := context.WithValue(r.Context(), userKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequirePermission guards a route on a single permission key (authoritative).
func RequirePermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := CurrentUser(r.Context())
			if user == nil || !rbac.HasPermission(user.Permissions, permission) {
				httpapi.JSON(w, http.StatusForbidden, map[string]any{"error": "forbidden"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
