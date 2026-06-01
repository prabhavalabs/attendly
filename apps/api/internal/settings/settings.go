// Package settings serves the org settings endpoints (settings.read/manage).
package settings

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/auth"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/store"
)

var defaults = map[string]string{"org_name": "attendly", "currency": "LKR", "timezone": "Asia/Colombo"}

// Handlers serves settings endpoints.
type Handlers struct{ db *sql.DB }

// New constructs the settings handlers.
func New(db *sql.DB) *Handlers { return &Handlers{db: db} }

// Mount registers the routes (assumes Authenticate is applied upstream).
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/api/settings", func(r chi.Router) {
		r.With(auth.RequirePermission("settings.read")).Method(http.MethodGet, "/", httpapi.Handler(h.get))
		r.With(auth.RequirePermission("settings.manage")).Method(http.MethodPatch, "/", httpapi.Handler(h.patch))
	})
}

type settingsView struct {
	OrgName  string `json:"org_name"`
	Currency string `json:"currency"`
	Timezone string `json:"timezone"`
}

func (h *Handlers) read(ctx context.Context) (settingsView, error) {
	rows, err := h.db.QueryContext(ctx, `SELECT key, value FROM settings`)
	if err != nil {
		return settingsView{}, err
	}
	defer rows.Close()
	vals := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return settingsView{}, err
		}
		vals[k] = v
	}
	if err := rows.Err(); err != nil {
		return settingsView{}, err
	}
	get := func(k string) string {
		if v, ok := vals[k]; ok {
			return v
		}
		return defaults[k]
	}
	return settingsView{OrgName: get("org_name"), Currency: get("currency"), Timezone: get("timezone")}, nil
}

func (h *Handlers) get(w http.ResponseWriter, r *http.Request) error {
	v, err := h.read(r.Context())
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, v)
	return nil
}

func (h *Handlers) patch(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		OrgName  *string `json:"org_name"`
		Currency *string `json:"currency"`
		Timezone *string `json:"timezone"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	updates := map[string]string{}
	for key, ptr := range map[string]*string{"org_name": in.OrgName, "currency": in.Currency, "timezone": in.Timezone} {
		if ptr != nil {
			v := strings.TrimSpace(*ptr)
			if v == "" {
				return httpapi.BadRequest("invalid_body")
			}
			updates[key] = v
		}
	}

	now := cryptox.NowISO()
	for key, value := range updates {
		if _, err := h.db.ExecContext(r.Context(),
			`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			key, value, now,
		); err != nil {
			return err
		}
	}
	actor := auth.MustUser(r.Context()).ID
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "settings.update", EntityType: strptr("settings"), After: updates})

	v, err := h.read(r.Context())
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, v)
	return nil
}

func strptr(s string) *string { return &s }
