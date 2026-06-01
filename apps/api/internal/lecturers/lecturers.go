// Package lecturers serves lecturer endpoints (lecturer.read/manage).
package lecturers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/auth"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/store"
)

// Handlers serves the lecturers domain.
type Handlers struct{ db *sql.DB }

// New constructs the lecturers handlers.
func New(db *sql.DB) *Handlers { return &Handlers{db: db} }

// Mount registers lecturer routes (Authenticate applied upstream).
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/api/lecturers", func(r chi.Router) {
		r.With(auth.RequirePermission("lecturer.read")).Method(http.MethodGet, "/", httpapi.Handler(h.list))
		manage := auth.RequirePermission("lecturer.manage")
		r.With(manage).Method(http.MethodPost, "/", httpapi.Handler(h.create))
		r.With(manage).Method(http.MethodPatch, "/{id}", httpapi.Handler(h.update))
		r.With(manage).Method(http.MethodDelete, "/{id}", httpapi.Handler(h.remove))
	})
}

func (h *Handlers) get(ctx context.Context, id string) (store.Row, error) {
	return store.QueryFirstMap(ctx, h.db, `SELECT id, name, phone, email, created_at FROM lecturers WHERE id = ? AND deleted_at IS NULL`, id)
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	rows, err := store.QueryMaps(r.Context(), h.db,
		`SELECT l.id, l.name, l.phone, l.email, l.created_at,
		        (SELECT COUNT(*) FROM classes c WHERE c.lecturer_id = l.id AND c.deleted_at IS NULL) AS class_count
		   FROM lecturers l WHERE l.deleted_at IS NULL ORDER BY l.name`)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"lecturers": rows})
	return nil
}

func (h *Handlers) create(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Name  string  `json:"name"`
		Phone *string `json:"phone"`
		Email *string `json:"email"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return httpapi.BadRequest("invalid_body")
	}
	id := cryptox.NewID("lec")
	now := cryptox.NowISO()
	if _, err := h.db.ExecContext(r.Context(), `INSERT INTO lecturers (id, name, phone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, id, in.Name, in.Phone, in.Email, now, now); err != nil {
		return err
	}
	actor := auth.MustUser(r.Context()).ID
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "lecturer.create", EntityType: sp("lecturer"), EntityID: &id})
	row, err := h.get(r.Context(), id)
	if err != nil {
		return err
	}
	row["class_count"] = 0
	httpapi.JSON(w, http.StatusCreated, row)
	return nil
}

func (h *Handlers) update(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	existing, err := h.get(r.Context(), id)
	if err != nil {
		return err
	}
	if existing == nil {
		return httpapi.NotFound("not_found")
	}
	var raw map[string]json.RawMessage
	if err := httpapi.Decode(r, &raw); err != nil {
		return err
	}
	sets, args := []string{}, []any{}
	for _, col := range []string{"name", "phone", "email"} {
		if v, ok := raw[col]; ok {
			var s *string
			_ = json.Unmarshal(v, &s)
			sets = append(sets, col+" = ?")
			args = append(args, s)
		}
	}
	sets = append(sets, "updated_at = ?")
	args = append(args, cryptox.NowISO())
	if _, err := h.db.ExecContext(r.Context(), `UPDATE lecturers SET `+strings.Join(sets, ", ")+` WHERE id = ?`, append(args, id)...); err != nil {
		return err
	}
	actor := auth.MustUser(r.Context()).ID
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "lecturer.update", EntityType: sp("lecturer"), EntityID: &id})
	row, err := h.get(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func (h *Handlers) remove(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	existing, err := h.get(r.Context(), id)
	if err != nil {
		return err
	}
	if existing == nil {
		return httpapi.NotFound("not_found")
	}
	now := cryptox.NowISO()
	if _, err := h.db.ExecContext(r.Context(), `UPDATE lecturers SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, id); err != nil {
		return err
	}
	if _, err := h.db.ExecContext(r.Context(), `UPDATE classes SET lecturer_id = NULL, updated_at = ? WHERE lecturer_id = ?`, now, id); err != nil {
		return err
	}
	actor := auth.MustUser(r.Context()).ID
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "lecturer.delete", EntityType: sp("lecturer"), EntityID: &id})
	httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func sp(s string) *string { return &s }
