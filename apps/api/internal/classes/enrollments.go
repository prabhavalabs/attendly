package classes

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/store"
)

func (h *Handlers) enrollmentsFor(ctx context.Context, classID string, limit, offset int) ([]map[string]any, error) {
	query := `SELECT e.id, e.class_id, e.status, e.fee_override_minor, e.enrolled_at,
		        COALESCE(e.fee_override_minor, c.fee_minor) AS effective_fee_minor,
		        s.id AS s_id, s.reg_no, s.full_name, s.phone, s.photo_url, s.status AS s_status, s.card_status
		   FROM enrollments e
		   JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
		   JOIN classes c ON c.id = e.class_id
		  WHERE e.class_id = ? ORDER BY e.status, s.name_normalized`
	args := []any{classID}
	if limit > 0 {
		query += " LIMIT ? OFFSET ?"
		args = append(args, limit, offset)
	}
	rows, err := store.QueryMaps(ctx, h.db, query, args...)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]any{
			"id": r["id"], "class_id": r["class_id"], "status": r["status"],
			"fee_override_minor": r["fee_override_minor"], "effective_fee_minor": r["effective_fee_minor"],
			"enrolled_at": r["enrolled_at"],
			"student": map[string]any{
				"id": r["s_id"], "reg_no": r["reg_no"], "full_name": r["full_name"],
				"phone": r["phone"], "photo_url": r["photo_url"], "status": r["s_status"], "card_status": r["card_status"],
			},
		})
	}
	return out, nil
}

func (h *Handlers) listEnrollments(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if err := h.requireClass(r.Context(), id); err != nil {
		return err
	}
	p := httpapi.ParsePage(r)
	var total int64
	if err := h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM enrollments WHERE class_id = ?`, id).Scan(&total); err != nil {
		return err
	}
	es, err := h.enrollmentsFor(r.Context(), id, p.Limit, p.Offset)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"enrollments": es, "total": total, "page": p.Page, "page_size": p.PageSize})
	return nil
}

func (h *Handlers) addEnrollment(w http.ResponseWriter, r *http.Request) error {
	classID := chi.URLParam(r, "id")
	var in struct {
		StudentID        string `json:"student_id"`
		FeeOverrideMinor *int64 `json:"fee_override_minor"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if in.StudentID == "" {
		return httpapi.BadRequest("invalid_body")
	}

	var capacity sql.NullInt64
	err := h.db.QueryRowContext(r.Context(), `SELECT capacity FROM classes WHERE id = ? AND deleted_at IS NULL`, classID).Scan(&capacity)
	if err == sql.ErrNoRows {
		return httpapi.NotFound("not_found")
	}
	if err != nil {
		return err
	}

	var sid string
	if err := h.db.QueryRowContext(r.Context(), `SELECT id FROM students WHERE id = ? AND deleted_at IS NULL`, in.StudentID).Scan(&sid); err == sql.ErrNoRows {
		return httpapi.Err(http.StatusUnprocessableEntity, "unknown_student")
	} else if err != nil {
		return err
	}

	var existingID, existingStatus string
	err = h.db.QueryRowContext(r.Context(), `SELECT id, status FROM enrollments WHERE student_id = ? AND class_id = ?`, in.StudentID, classID).Scan(&existingID, &existingStatus)
	hasExisting := err == nil
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if hasExisting && existingStatus == "active" {
		return httpapi.Conflict("already_enrolled")
	}
	if capacity.Valid {
		var n int64
		if err := h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM enrollments WHERE class_id = ? AND status = 'active'`, classID).Scan(&n); err != nil {
			return err
		}
		if n >= capacity.Int64 {
			return httpapi.Conflict("class_full")
		}
	}

	now := cryptox.NowISO()
	if hasExisting {
		if _, err := h.db.ExecContext(r.Context(), `UPDATE enrollments SET status = 'active', fee_override_minor = ?, enrolled_at = ? WHERE id = ?`, in.FeeOverrideMinor, now, existingID); err != nil {
			return err
		}
	} else if _, err := h.db.ExecContext(r.Context(), `INSERT INTO enrollments (id, student_id, class_id, fee_override_minor, status, enrolled_at) VALUES (?, ?, ?, ?, 'active', ?)`, cryptox.NewID("enr"), in.StudentID, classID, in.FeeOverrideMinor, now); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "enrollment.add", EntityType: sp("class"), EntityID: &classID, After: map[string]any{"student_id": in.StudentID}})
	httpapi.JSON(w, http.StatusCreated, map[string]any{"ok": true})
	return nil
}

func (h *Handlers) updateEnrollment(w http.ResponseWriter, r *http.Request) error {
	classID, eid := chi.URLParam(r, "id"), chi.URLParam(r, "eid")
	var x string
	if err := h.db.QueryRowContext(r.Context(), `SELECT id FROM enrollments WHERE id = ? AND class_id = ?`, eid, classID).Scan(&x); err == sql.ErrNoRows {
		return httpapi.NotFound("not_found")
	} else if err != nil {
		return err
	}
	var raw map[string]json.RawMessage
	if err := httpapi.Decode(r, &raw); err != nil {
		return err
	}
	sets, args := []string{}, []any{}
	if v, ok := raw["fee_override_minor"]; ok {
		var n *int64
		_ = json.Unmarshal(v, &n)
		sets, args = append(sets, "fee_override_minor = ?"), append(args, n)
	}
	if v, ok := raw["status"]; ok {
		var s *string
		_ = json.Unmarshal(v, &s)
		sets, args = append(sets, "status = ?"), append(args, s)
	}
	if len(sets) > 0 {
		if _, err := h.db.ExecContext(r.Context(), `UPDATE enrollments SET `+joinSets(sets)+` WHERE id = ?`, append(args, eid)...); err != nil {
			return err
		}
		actor := h.actor(r)
		_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "enrollment.update", EntityType: sp("class"), EntityID: &classID})
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func (h *Handlers) removeEnrollment(w http.ResponseWriter, r *http.Request) error {
	classID, eid := chi.URLParam(r, "id"), chi.URLParam(r, "eid")
	if _, err := h.db.ExecContext(r.Context(), `DELETE FROM enrollments WHERE id = ? AND class_id = ?`, eid, classID); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "enrollment.remove", EntityType: sp("class"), EntityID: &classID})
	httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func joinSets(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ", "
		}
		out += p
	}
	return out
}
