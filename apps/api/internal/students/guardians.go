package students

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

type guardianView struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Phone        string  `json:"phone"`
	Email        *string `json:"email"`
	Relationship string  `json:"relationship"`
	IsPrimary    bool    `json:"is_primary"`
}

type createGuardianInput struct {
	Name         string  `json:"name"`
	Phone        string  `json:"phone"`
	Email        *string `json:"email"`
	Relationship string  `json:"relationship"`
	IsPrimary    bool    `json:"is_primary"`
}

func (h *Handlers) guardians(ctx context.Context, studentID string) ([]guardianView, error) {
	rows, err := h.db.QueryContext(ctx,
		`SELECT g.id, g.name, g.phone, g.email, sg.relationship, sg.is_primary
		   FROM guardians g JOIN student_guardians sg ON sg.guardian_id = g.id
		  WHERE sg.student_id = ? ORDER BY sg.is_primary DESC, g.name`, studentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []guardianView{}
	for rows.Next() {
		var g guardianView
		var email sql.NullString
		var primary int
		if err := rows.Scan(&g.ID, &g.Name, &g.Phone, &email, &g.Relationship, &primary); err != nil {
			return nil, err
		}
		if email.Valid {
			g.Email = &email.String
		}
		g.IsPrimary = primary == 1
		out = append(out, g)
	}
	return out, rows.Err()
}

func (h *Handlers) insertGuardian(ctx context.Context, studentID string, g createGuardianInput) error {
	rel := g.Relationship
	if rel == "" {
		rel = "guardian"
	}
	now := cryptox.NowISO()
	gid := cryptox.NewID("grd")
	if g.IsPrimary {
		if _, err := h.db.ExecContext(ctx, `UPDATE student_guardians SET is_primary = 0 WHERE student_id = ?`, studentID); err != nil {
			return err
		}
	}
	if _, err := h.db.ExecContext(ctx,
		`INSERT INTO guardians (id, name, phone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		gid, g.Name, g.Phone, g.Email, now, now); err != nil {
		return err
	}
	primary := 0
	if g.IsPrimary {
		primary = 1
	}
	_, err := h.db.ExecContext(ctx,
		`INSERT INTO student_guardians (student_id, guardian_id, relationship, is_primary) VALUES (?, ?, ?, ?)`,
		studentID, gid, rel, primary)
	return err
}

func (h *Handlers) addGuardian(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	var in createGuardianInput
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if in.Name == "" || in.Phone == "" {
		return httpapi.BadRequest("invalid_body")
	}
	if err := h.requireStudent(r.Context(), id); err != nil {
		return err
	}
	if err := h.insertGuardian(r.Context(), id, in); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "guardian.add", EntityType: sp("student"), EntityID: &id, After: map[string]any{"name": in.Name}})
	gs, err := h.guardians(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusCreated, map[string]any{"guardians": gs})
	return nil
}

func (h *Handlers) patchGuardian(w http.ResponseWriter, r *http.Request) error {
	id, gid := chi.URLParam(r, "id"), chi.URLParam(r, "gid")
	if err := h.requireStudent(r.Context(), id); err != nil {
		return err
	}
	var link string
	if err := h.db.QueryRowContext(r.Context(), `SELECT student_id FROM student_guardians WHERE student_id = ? AND guardian_id = ?`, id, gid).Scan(&link); err == sql.ErrNoRows {
		return httpapi.NotFound("guardian_not_found")
	} else if err != nil {
		return err
	}

	var raw map[string]json.RawMessage
	if err := httpapi.Decode(r, &raw); err != nil {
		return err
	}
	str := func(k string) (*string, bool) {
		v, ok := raw[k]
		if !ok {
			return nil, false
		}
		var s *string
		_ = json.Unmarshal(v, &s)
		return s, true
	}

	gSets, gArgs := []string{}, []any{}
	for _, col := range []string{"name", "phone", "email"} {
		if v, ok := str(col); ok {
			gSets = append(gSets, col+" = ?")
			gArgs = append(gArgs, v)
		}
	}
	if len(gSets) > 0 {
		gSets = append(gSets, "updated_at = ?")
		gArgs = append(gArgs, cryptox.NowISO())
		if _, err := h.db.ExecContext(r.Context(), `UPDATE guardians SET `+join(gSets)+` WHERE id = ?`, append(gArgs, gid)...); err != nil {
			return err
		}
	}

	_, primaryProvided := raw["is_primary"]
	primaryVal := false
	if primaryProvided {
		_ = json.Unmarshal(raw["is_primary"], &primaryVal)
		if primaryVal {
			if _, err := h.db.ExecContext(r.Context(), `UPDATE student_guardians SET is_primary = 0 WHERE student_id = ?`, id); err != nil {
				return err
			}
		}
	}
	_, relProvided := raw["relationship"]
	if relProvided || primaryProvided {
		lSets, lArgs := []string{}, []any{}
		if rel, ok := str("relationship"); ok && rel != nil {
			lSets = append(lSets, "relationship = ?")
			lArgs = append(lArgs, *rel)
		}
		if primaryProvided {
			p := 0
			if primaryVal {
				p = 1
			}
			lSets = append(lSets, "is_primary = ?")
			lArgs = append(lArgs, p)
		}
		if len(lSets) > 0 {
			if _, err := h.db.ExecContext(r.Context(), `UPDATE student_guardians SET `+join(lSets)+` WHERE student_id = ? AND guardian_id = ?`, append(lArgs, id, gid)...); err != nil {
				return err
			}
		}
	}

	gs, err := h.guardians(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"guardians": gs})
	return nil
}

func (h *Handlers) removeGuardian(w http.ResponseWriter, r *http.Request) error {
	id, gid := chi.URLParam(r, "id"), chi.URLParam(r, "gid")
	if _, err := h.db.ExecContext(r.Context(), `DELETE FROM student_guardians WHERE student_id = ? AND guardian_id = ?`, id, gid); err != nil {
		return err
	}
	var others int
	if err := h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM student_guardians WHERE guardian_id = ?`, gid).Scan(&others); err != nil {
		return err
	}
	if others == 0 {
		if _, err := h.db.ExecContext(r.Context(), `DELETE FROM guardians WHERE id = ?`, gid); err != nil {
			return err
		}
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "guardian.remove", EntityType: sp("student"), EntityID: &id})
	gs, err := h.guardians(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"guardians": gs})
	return nil
}

func join(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ", "
		}
		out += p
	}
	return out
}
