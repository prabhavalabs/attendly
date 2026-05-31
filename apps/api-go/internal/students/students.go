// Package students serves student, card and guardian endpoints (student.* /
// card.* permissions). Ported from the Worker's students route group.
package students

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/auth"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/storage"
	"attendly/api/internal/store"
	"attendly/api/internal/text"
)

const studentCols = `id, reg_no, full_name, phone, email, photo_url, card_token,
	card_status, card_issued_at, status, date_of_birth, address, notes, created_at, updated_at`

var validStatus = map[string]bool{"active": true, "inactive": true, "graduated": true, "withdrawn": true}

// Handlers serves the students domain.
type Handlers struct {
	db    *sql.DB
	store storage.Store
}

// New constructs the students handlers.
func New(db *sql.DB, st storage.Store) *Handlers { return &Handlers{db: db, store: st} }

// Mount registers all student routes (Authenticate applied upstream).
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/api/students", func(r chi.Router) {
		read := auth.RequirePermission("student.read")
		create := auth.RequirePermission("student.create")
		update := auth.RequirePermission("student.update")
		del := auth.RequirePermission("student.delete")

		r.With(read).Method(http.MethodGet, "/", httpapi.Handler(h.list))
		r.With(read).Method(http.MethodGet, "/search", httpapi.Handler(h.search))
		r.With(create).Method(http.MethodPost, "/", httpapi.Handler(h.create))
		r.With(read).Method(http.MethodGet, "/{id}", httpapi.Handler(h.get))
		r.With(read).Method(http.MethodGet, "/{id}/enrollments", httpapi.Handler(h.enrollments))
		r.With(update).Method(http.MethodPatch, "/{id}", httpapi.Handler(h.update))
		r.With(del).Method(http.MethodDelete, "/{id}", httpapi.Handler(h.remove))

		r.With(update).Method(http.MethodPost, "/{id}/photo", httpapi.Handler(h.uploadPhoto))
		r.With(read).Method(http.MethodGet, "/{id}/photo", httpapi.Handler(h.getPhoto))
		r.With(update).Method(http.MethodDelete, "/{id}/photo", httpapi.Handler(h.deletePhoto))

		r.With(auth.RequirePermission("card.issue")).Method(http.MethodPost, "/{id}/card/issue", httpapi.Handler(h.issueCard))
		r.With(auth.RequirePermission("card.revoke")).Method(http.MethodPost, "/{id}/card/revoke", httpapi.Handler(h.revokeCard))
		r.With(auth.RequirePermission("card.issue")).Method(http.MethodGet, "/{id}/card.pdf", httpapi.Handler(h.cardPDF))

		r.With(update).Method(http.MethodPost, "/{id}/guardians", httpapi.Handler(h.addGuardian))
		r.With(update).Method(http.MethodPatch, "/{id}/guardians/{gid}", httpapi.Handler(h.patchGuardian))
		r.With(update).Method(http.MethodDelete, "/{id}/guardians/{gid}", httpapi.Handler(h.removeGuardian))
	})
}

func (h *Handlers) actor(r *http.Request) string { return auth.MustUser(r.Context()).ID }

func (h *Handlers) getStudent(ctx context.Context, id string) (store.Row, error) {
	return store.QueryFirstMap(ctx, h.db, `SELECT `+studentCols+` FROM students WHERE id = ? AND deleted_at IS NULL`, id)
}

// detail returns the student row plus guardians, or nil if not found.
func (h *Handlers) detail(ctx context.Context, id string) (store.Row, error) {
	row, err := h.getStudent(ctx, id)
	if err != nil || row == nil {
		return row, err
	}
	gs, err := h.guardians(ctx, id)
	if err != nil {
		return nil, err
	}
	row["guardians"] = gs
	return row, nil
}

func (h *Handlers) requireStudent(ctx context.Context, id string) error {
	var x string
	err := h.db.QueryRowContext(ctx, `SELECT id FROM students WHERE id = ? AND deleted_at IS NULL`, id).Scan(&x)
	if err == sql.ErrNoRows {
		return httpapi.NotFound("not_found")
	}
	return err
}

func (h *Handlers) nextRegNo(ctx context.Context) (string, error) {
	prefix := fmt.Sprintf("%d-", time.Now().UTC().Year())
	var last string
	err := h.db.QueryRowContext(ctx, `SELECT reg_no FROM students WHERE reg_no LIKE ? ORDER BY reg_no DESC LIMIT 1`, prefix+"%").Scan(&last)
	next := 1
	if err == nil {
		if n, e := strconv.Atoi(strings.TrimPrefix(last, prefix)); e == nil {
			next = n + 1
		}
	} else if err != sql.ErrNoRows {
		return "", err
	}
	return fmt.Sprintf("%s%04d", prefix, next), nil
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	status := r.URL.Query().Get("status")
	page := atoiDefault(r.URL.Query().Get("page"), 1, 1, 1<<31)
	pageSize := atoiDefault(r.URL.Query().Get("page_size"), 20, 1, 100)

	where := []string{"deleted_at IS NULL"}
	args := []any{}
	if status != "" {
		where = append(where, "status = ?")
		args = append(args, status)
	}
	if q != "" {
		where = append(where, `(name_normalized LIKE ? ESCAPE '\' OR reg_no LIKE ? ESCAPE '\' OR phone LIKE ? ESCAPE '\')`)
		args = append(args, "%"+text.LikeEscape(text.NormalizeName(q))+"%", "%"+text.LikeEscape(q)+"%", "%"+text.LikeEscape(q)+"%")
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM students WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return err
	}
	rows, err := store.QueryMaps(r.Context(), h.db,
		`SELECT id, reg_no, full_name, phone, photo_url, status, card_status FROM students WHERE `+whereSQL+
			` ORDER BY created_at DESC LIMIT ? OFFSET ?`, append(args, pageSize, (page-1)*pageSize)...)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"students": rows, "total": total, "page": page, "page_size": pageSize})
	return nil
}

func (h *Handlers) search(w http.ResponseWriter, r *http.Request) error {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		httpapi.JSON(w, http.StatusOK, map[string]any{"students": []any{}})
		return nil
	}
	rows, err := store.QueryMaps(r.Context(), h.db,
		`SELECT id, reg_no, full_name, phone, photo_url, status, card_status FROM students
		  WHERE deleted_at IS NULL AND (name_normalized LIKE ? ESCAPE '\' OR reg_no LIKE ? ESCAPE '\' OR phone LIKE ? ESCAPE '\')
		  ORDER BY name_normalized LIMIT 10`,
		"%"+text.LikeEscape(text.NormalizeName(q))+"%", "%"+text.LikeEscape(q)+"%", "%"+text.LikeEscape(q)+"%")
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"students": rows})
	return nil
}

func (h *Handlers) get(w http.ResponseWriter, r *http.Request) error {
	row, err := h.detail(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	if row == nil {
		return httpapi.NotFound("not_found")
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func (h *Handlers) enrollments(w http.ResponseWriter, r *http.Request) error {
	rows, err := store.QueryMaps(r.Context(), h.db,
		`SELECT e.id, e.class_id, c.name AS class_name, c.code, c.band, e.status,
		        COALESCE(e.fee_override_minor, c.fee_minor) AS effective_fee_minor
		   FROM enrollments e JOIN classes c ON c.id = e.class_id AND c.deleted_at IS NULL
		  WHERE e.student_id = ? ORDER BY e.status, c.name`, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"enrollments": rows})
	return nil
}

type createStudentInput struct {
	FullName    string                `json:"full_name"`
	Phone       *string               `json:"phone"`
	Email       *string               `json:"email"`
	DateOfBirth *string               `json:"date_of_birth"`
	Address     *string               `json:"address"`
	Notes       *string               `json:"notes"`
	Status      string                `json:"status"`
	Guardians   []createGuardianInput `json:"guardians"`
}

func (h *Handlers) create(w http.ResponseWriter, r *http.Request) error {
	var in createStudentInput
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	in.FullName = strings.TrimSpace(in.FullName)
	if in.FullName == "" {
		return httpapi.BadRequest("invalid_body")
	}
	if in.Status == "" {
		in.Status = "active"
	}
	if !validStatus[in.Status] || len(in.Guardians) > 6 {
		return httpapi.BadRequest("invalid_body")
	}

	id := cryptox.NewID("stu")
	regNo, err := h.nextRegNo(r.Context())
	if err != nil {
		return err
	}
	now := cryptox.NowISO()
	if _, err := h.db.ExecContext(r.Context(),
		`INSERT INTO students (id, reg_no, full_name, name_normalized, phone, email, card_token,
			card_status, card_issued_at, status, date_of_birth, address, notes, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
		id, regNo, in.FullName, text.NormalizeName(in.FullName), in.Phone, in.Email, cryptox.RandomToken(16),
		now, in.Status, in.DateOfBirth, in.Address, in.Notes, now, now,
	); err != nil {
		return err
	}
	for _, g := range in.Guardians {
		if err := h.insertGuardian(r.Context(), id, g); err != nil {
			return err
		}
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "student.create", EntityType: sp("student"), EntityID: &id, After: map[string]any{"reg_no": regNo, "full_name": in.FullName}})

	row, err := h.detail(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusCreated, row)
	return nil
}

// updatable columns and whether the JSON value also drives name_normalized.
var updatableCols = map[string]bool{
	"full_name": true, "phone": true, "email": true,
	"date_of_birth": true, "address": true, "notes": true, "status": true,
}

func (h *Handlers) update(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	existing, err := h.getStudent(r.Context(), id)
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
	sets := []string{}
	args := []any{}
	for col, val := range raw {
		if !updatableCols[col] {
			return httpapi.BadRequest("invalid_body")
		}
		var s *string
		if err := json.Unmarshal(val, &s); err != nil {
			return httpapi.BadRequest("invalid_body")
		}
		if col == "status" {
			if s == nil || !validStatus[*s] {
				return httpapi.BadRequest("invalid_body")
			}
		}
		sets = append(sets, col+" = ?")
		args = append(args, s)
		if col == "full_name" {
			norm := ""
			if s != nil {
				norm = text.NormalizeName(*s)
			}
			sets = append(sets, "name_normalized = ?")
			args = append(args, norm)
		}
	}
	sets = append(sets, "updated_at = ?")
	args = append(args, cryptox.NowISO())
	if _, err := h.db.ExecContext(r.Context(), `UPDATE students SET `+strings.Join(sets, ", ")+` WHERE id = ?`, append(args, id)...); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "student.update", EntityType: sp("student"), EntityID: &id})

	row, err := h.detail(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func (h *Handlers) remove(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if err := h.requireStudent(r.Context(), id); err != nil {
		return err
	}
	now := cryptox.NowISO()
	if _, err := h.db.ExecContext(r.Context(), `UPDATE students SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, id); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "student.delete", EntityType: sp("student"), EntityID: &id})
	httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func atoiDefault(s string, def, min, max int) int {
	n, err := strconv.Atoi(s)
	if err != nil || n < min {
		return def
	}
	if n > max {
		return max
	}
	return n
}

func sp(s string) *string { return &s }
