// Package classes serves class, enrollment and timetable endpoints
// (class.*, timetable.* permissions).
package classes

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

const classSelect = `
	SELECT c.id, c.name, c.subject, c.code, c.band, c.fee_minor, c.capacity, c.room,
	       c.lecturer_id, l.name AS lecturer_name, c.status, c.created_at, c.updated_at,
	       (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active') AS enrolled_count
	  FROM classes c
	  LEFT JOIN lecturers l ON l.id = c.lecturer_id AND l.deleted_at IS NULL`

var validBand = map[string]bool{"teal": true, "amber": true, "coral": true, "blue": true, "violet": true, "green": true}

// Handlers serves the classes domain.
type Handlers struct{ db *sql.DB }

// New constructs the classes handlers.
func New(db *sql.DB) *Handlers { return &Handlers{db: db} }

// Mount registers class/enrollment/timetable routes (Authenticate upstream).
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/api/classes", func(r chi.Router) {
		read := auth.RequirePermission("class.read")
		manage := auth.RequirePermission("class.manage")
		ttRead := auth.RequirePermission("timetable.read")
		ttManage := auth.RequirePermission("timetable.manage")

		r.With(read).Method(http.MethodGet, "/", httpapi.Handler(h.list))
		r.With(manage).Method(http.MethodPost, "/", httpapi.Handler(h.create))
		r.With(read).Method(http.MethodGet, "/{id}", httpapi.Handler(h.get))
		r.With(manage).Method(http.MethodPatch, "/{id}", httpapi.Handler(h.update))
		r.With(manage).Method(http.MethodDelete, "/{id}", httpapi.Handler(h.remove))

		r.With(read).Method(http.MethodGet, "/{id}/enrollments", httpapi.Handler(h.listEnrollments))
		r.With(manage).Method(http.MethodPost, "/{id}/enrollments", httpapi.Handler(h.addEnrollment))
		r.With(manage).Method(http.MethodPatch, "/{id}/enrollments/{eid}", httpapi.Handler(h.updateEnrollment))
		r.With(manage).Method(http.MethodDelete, "/{id}/enrollments/{eid}", httpapi.Handler(h.removeEnrollment))

		r.With(ttRead).Method(http.MethodGet, "/{id}/timetable", httpapi.Handler(h.listTimetable))
		r.With(ttManage).Method(http.MethodPost, "/{id}/timetable", httpapi.Handler(h.addTimetable))
		r.With(ttManage).Method(http.MethodDelete, "/{id}/timetable/{slotId}", httpapi.Handler(h.removeTimetable))
	})
}

func (h *Handlers) actor(r *http.Request) string { return auth.MustUser(r.Context()).ID }

func (h *Handlers) getClass(ctx context.Context, id string) (store.Row, error) {
	return store.QueryFirstMap(ctx, h.db, classSelect+` WHERE c.id = ? AND c.deleted_at IS NULL`, id)
}

func (h *Handlers) requireClass(ctx context.Context, id string) error {
	var x string
	err := h.db.QueryRowContext(ctx, `SELECT id FROM classes WHERE id = ? AND deleted_at IS NULL`, id).Scan(&x)
	if err == sql.ErrNoRows {
		return httpapi.NotFound("not_found")
	}
	return err
}

func (h *Handlers) timetable(ctx context.Context, classID string) ([]store.Row, error) {
	return store.QueryMaps(ctx, h.db,
		`SELECT id, class_id, weekday, start_time, end_time, room FROM timetable_slots WHERE class_id = ? ORDER BY weekday, start_time`, classID)
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	status := r.URL.Query().Get("status")
	q := classSelect + ` WHERE c.deleted_at IS NULL`
	args := []any{}
	if status == "active" || status == "archived" {
		q += ` AND c.status = ?`
		args = append(args, status)
	}
	rows, err := store.QueryMaps(r.Context(), h.db, q+` ORDER BY c.status, c.name`, args...)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"classes": rows})
	return nil
}

func (h *Handlers) get(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	cls, err := h.getClass(r.Context(), id)
	if err != nil {
		return err
	}
	if cls == nil {
		return httpapi.NotFound("not_found")
	}
	tt, err := h.timetable(r.Context(), id)
	if err != nil {
		return err
	}
	cls["timetable"] = tt
	httpapi.JSON(w, http.StatusOK, cls)
	return nil
}

type createClassInput struct {
	Name       string  `json:"name"`
	Subject    string  `json:"subject"`
	Code       string  `json:"code"`
	Band       string  `json:"band"`
	FeeMinor   int64   `json:"fee_minor"`
	Capacity   *int64  `json:"capacity"`
	Room       *string `json:"room"`
	LecturerID *string `json:"lecturer_id"`
}

func (h *Handlers) create(w http.ResponseWriter, r *http.Request) error {
	var in createClassInput
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	in.Name, in.Subject, in.Code = strings.TrimSpace(in.Name), strings.TrimSpace(in.Subject), strings.TrimSpace(in.Code)
	if in.Name == "" || in.Subject == "" || in.Code == "" || !validBand[in.Band] || in.FeeMinor < 0 {
		return httpapi.BadRequest("invalid_body")
	}
	id := cryptox.NewID("cls")
	now := cryptox.NowISO()
	if _, err := h.db.ExecContext(r.Context(),
		`INSERT INTO classes (id, name, subject, code, band, fee_minor, capacity, room, lecturer_id, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
		id, in.Name, in.Subject, in.Code, in.Band, in.FeeMinor, in.Capacity, in.Room, in.LecturerID, now, now); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "class.create", EntityType: sp("class"), EntityID: &id, After: map[string]any{"name": in.Name}})
	row, err := h.getClass(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusCreated, row)
	return nil
}

var classStringCols = map[string]bool{"name": true, "subject": true, "code": true, "band": true, "room": true, "lecturer_id": true, "status": true}
var classNumCols = map[string]bool{"fee_minor": true, "capacity": true}

func (h *Handlers) update(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if err := h.requireClass(r.Context(), id); err != nil {
		return err
	}
	var raw map[string]json.RawMessage
	if err := httpapi.Decode(r, &raw); err != nil {
		return err
	}
	sets, args := []string{}, []any{}
	for col, val := range raw {
		switch {
		case classStringCols[col]:
			var s *string
			if err := json.Unmarshal(val, &s); err != nil {
				return httpapi.BadRequest("invalid_body")
			}
			sets, args = append(sets, col+" = ?"), append(args, s)
		case classNumCols[col]:
			var n *int64
			if err := json.Unmarshal(val, &n); err != nil {
				return httpapi.BadRequest("invalid_body")
			}
			sets, args = append(sets, col+" = ?"), append(args, n)
		default:
			return httpapi.BadRequest("invalid_body")
		}
	}
	sets = append(sets, "updated_at = ?")
	args = append(args, cryptox.NowISO())
	if _, err := h.db.ExecContext(r.Context(), `UPDATE classes SET `+strings.Join(sets, ", ")+` WHERE id = ?`, append(args, id)...); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "class.update", EntityType: sp("class"), EntityID: &id})
	row, err := h.getClass(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func (h *Handlers) remove(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if err := h.requireClass(r.Context(), id); err != nil {
		return err
	}
	now := cryptox.NowISO()
	if _, err := h.db.ExecContext(r.Context(), `UPDATE classes SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, id); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "class.delete", EntityType: sp("class"), EntityID: &id})
	httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func sp(s string) *string { return &s }
