// Package sessions serves class-session endpoints (session.* permissions):
// generate from the timetable, list/get, roster, attendance clear, and update.
package sessions

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/auth"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/store"
)

const sessionSelect = `
	SELECT cs.id, cs.class_id, c.name AS class_name, c.code, c.band,
	       cs.session_date, cs.start_time, cs.end_time, cs.status, cs.topic,
	       cs.substitute_lecturer_id, cs.created_at,
	       (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = cs.class_id AND e.status = 'active') AS enrolled_count,
	       (SELECT COUNT(*) FROM attendance a WHERE a.session_id = cs.id AND a.status IN ('present', 'late')) AS present_count
	  FROM class_sessions cs JOIN classes c ON c.id = cs.class_id`

const dayMS = 24 * time.Hour

// SyncHook is an optional best-effort calendar sync invoked after a session
// changes; nil disables it.
type SyncHook func(sessionID string)

// Handlers serves the sessions domain.
type Handlers struct {
	db   *sql.DB
	sync SyncHook
}

// New constructs the sessions handlers. hook may be nil.
func New(db *sql.DB, hook SyncHook) *Handlers { return &Handlers{db: db, sync: hook} }

// Mount registers session routes (Authenticate applied upstream).
func (h *Handlers) Mount(r chi.Router) {
	read := auth.RequirePermission("session.read")
	manage := auth.RequirePermission("session.manage")
	r.Route("/api/sessions", func(r chi.Router) {
		r.With(manage).Method(http.MethodPost, "/generate", httpapi.Handler(h.generate))
		r.With(read).Method(http.MethodGet, "/", httpapi.Handler(h.list))
		r.With(read).Method(http.MethodGet, "/{id}", httpapi.Handler(h.get))
		r.With(read).Method(http.MethodGet, "/{id}/roster", httpapi.Handler(h.roster))
		r.With(auth.RequirePermission("attendance.record")).Method(http.MethodDelete, "/{id}/attendance/{studentId}", httpapi.Handler(h.clearAttendance))
		r.With(manage).Method(http.MethodPatch, "/{id}", httpapi.Handler(h.update))
	})
}

func (h *Handlers) actor(r *http.Request) string { return auth.MustUser(r.Context()).ID }

func (h *Handlers) getSession(ctx context.Context, id string) (store.Row, error) {
	return store.QueryFirstMap(ctx, h.db, sessionSelect+` WHERE cs.id = ?`, id)
}

type slot struct {
	weekday   int
	startTime string
	endTime   string
}

func (h *Handlers) generate(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		ClassID string `json:"class_id"`
		From    string `json:"from"`
		To      string `json:"to"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	start, err1 := time.Parse("2006-01-02", in.From)
	end, err2 := time.Parse("2006-01-02", in.To)
	if err1 != nil || err2 != nil {
		return httpapi.Err(http.StatusUnprocessableEntity, "invalid_date")
	}
	if end.Sub(start) > 366*dayMS {
		return httpapi.Err(http.StatusUnprocessableEntity, "range_too_large")
	}

	// Active classes in scope.
	var classQuery string
	args := []any{}
	if in.ClassID != "" {
		classQuery = `SELECT id FROM classes WHERE id = ? AND deleted_at IS NULL AND status = 'active'`
		args = append(args, in.ClassID)
	} else {
		classQuery = `SELECT id FROM classes WHERE deleted_at IS NULL AND status = 'active'`
	}
	classRows, err := h.db.QueryContext(r.Context(), classQuery, args...)
	if err != nil {
		return err
	}
	var classIDs []string
	for classRows.Next() {
		var id string
		if err := classRows.Scan(&id); err != nil {
			classRows.Close()
			return err
		}
		classIDs = append(classIDs, id)
	}
	classRows.Close()
	if err := classRows.Err(); err != nil {
		return err
	}
	if len(classIDs) == 0 {
		httpapi.JSON(w, http.StatusOK, map[string]any{"created": 0, "classes": 0})
		return nil
	}

	slotsByClass := map[string][]slot{}
	for _, cid := range classIDs {
		rows, err := h.db.QueryContext(r.Context(), `SELECT weekday, start_time, end_time FROM timetable_slots WHERE class_id = ? ORDER BY start_time`, cid)
		if err != nil {
			return err
		}
		for rows.Next() {
			var s slot
			if err := rows.Scan(&s.weekday, &s.startTime, &s.endTime); err != nil {
				rows.Close()
				return err
			}
			slotsByClass[cid] = append(slotsByClass[cid], s)
		}
		rows.Close()
	}

	now := cryptox.NowISO()
	created := 0
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for t := start; !t.After(end); t = t.Add(dayMS) {
		dateStr := t.Format("2006-01-02")
		wd := int(t.Weekday())
		for _, cid := range classIDs {
			// earliest slot on this weekday
			var match *slot
			for i := range slotsByClass[cid] {
				s := slotsByClass[cid][i]
				if s.weekday == wd && (match == nil || s.startTime < match.startTime) {
					sc := s
					match = &sc
				}
			}
			if match == nil {
				continue
			}
			res, err := tx.ExecContext(r.Context(),
				`INSERT OR IGNORE INTO class_sessions (id, class_id, session_date, start_time, end_time, status, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
				cryptox.NewID("ses"), cid, dateStr, match.startTime, match.endTime, now, now)
			if err != nil {
				return err
			}
			if n, _ := res.RowsAffected(); n > 0 {
				created++
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	var classID *string
	if in.ClassID != "" {
		classID = &in.ClassID
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "session.generate", EntityType: sp("class"), EntityID: classID, After: map[string]any{"from": in.From, "to": in.To, "created": created}})
	httpapi.JSON(w, http.StatusOK, map[string]any{"created": created, "classes": len(classIDs)})
	return nil
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	where, args := []string{}, []any{}
	if v := q.Get("from"); v != "" {
		where, args = append(where, "cs.session_date >= ?"), append(args, v)
	}
	if v := q.Get("to"); v != "" {
		where, args = append(where, "cs.session_date <= ?"), append(args, v)
	}
	if v := q.Get("class_id"); v != "" {
		where, args = append(where, "cs.class_id = ?"), append(args, v)
	}
	if v := q.Get("status"); v != "" {
		where, args = append(where, "cs.status = ?"), append(args, v)
	}
	whereSQL := ""
	if len(where) > 0 {
		whereSQL = " WHERE " + joinAnd(where)
	}
	var total int64
	if err := h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM class_sessions cs`+whereSQL, args...).Scan(&total); err != nil {
		return err
	}
	p := httpapi.ParsePage(r)
	rows, err := store.QueryMaps(r.Context(), h.db,
		sessionSelect+whereSQL+" ORDER BY cs.session_date, cs.start_time LIMIT ? OFFSET ?",
		append(args, p.Limit, p.Offset)...)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"sessions": rows, "total": total, "page": p.Page, "page_size": p.PageSize})
	return nil
}

func (h *Handlers) get(w http.ResponseWriter, r *http.Request) error {
	row, err := h.getSession(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	if row == nil {
		return httpapi.NotFound("not_found")
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func (h *Handlers) roster(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	var classID string
	err := h.db.QueryRowContext(r.Context(), `SELECT class_id FROM class_sessions WHERE id = ?`, id).Scan(&classID)
	if err == sql.ErrNoRows {
		return httpapi.NotFound("not_found")
	}
	if err != nil {
		return err
	}
	rows, err := store.QueryMaps(r.Context(), h.db,
		`SELECT s.id, s.reg_no, s.full_name, s.phone, s.photo_url, s.status, s.card_status,
		        a.status AS att_status, a.method, a.checked_in_at
		   FROM enrollments e
		   JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
		   LEFT JOIN attendance a ON a.session_id = ? AND a.student_id = s.id
		  WHERE e.class_id = ? AND e.status = 'active' ORDER BY s.name_normalized`, id, classID)
	if err != nil {
		return err
	}
	roster := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		roster = append(roster, map[string]any{
			"student": map[string]any{
				"id": r["id"], "reg_no": r["reg_no"], "full_name": r["full_name"],
				"phone": r["phone"], "photo_url": r["photo_url"], "status": r["status"], "card_status": r["card_status"],
			},
			"status": r["att_status"], "method": r["method"], "checked_in_at": r["checked_in_at"],
		})
	}
	sess, err := h.getSession(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"session": sess, "roster": roster})
	return nil
}

func (h *Handlers) clearAttendance(w http.ResponseWriter, r *http.Request) error {
	id, studentID := chi.URLParam(r, "id"), chi.URLParam(r, "studentId")
	if _, err := h.db.ExecContext(r.Context(), `DELETE FROM attendance WHERE session_id = ? AND student_id = ?`, id, studentID); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "attendance.clear", EntityType: sp("session"), EntityID: &id, After: map[string]any{"student_id": studentID}})
	httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func (h *Handlers) update(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	var x string
	if err := h.db.QueryRowContext(r.Context(), `SELECT id FROM class_sessions WHERE id = ?`, id).Scan(&x); err == sql.ErrNoRows {
		return httpapi.NotFound("not_found")
	} else if err != nil {
		return err
	}
	var raw map[string]json.RawMessage
	if err := httpapi.Decode(r, &raw); err != nil {
		return err
	}
	sets, args := []string{}, []any{}
	for _, col := range []string{"status", "topic", "substitute_lecturer_id"} {
		if v, ok := raw[col]; ok {
			var s *string
			if err := json.Unmarshal(v, &s); err != nil {
				return httpapi.BadRequest("invalid_body")
			}
			sets, args = append(sets, col+" = ?"), append(args, s)
		}
	}
	sets = append(sets, "updated_at = ?")
	args = append(args, cryptox.NowISO())
	if _, err := h.db.ExecContext(r.Context(), `UPDATE class_sessions SET `+joinComma(sets)+` WHERE id = ?`, append(args, id)...); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "session.update", EntityType: sp("session"), EntityID: &id})
	if h.sync != nil {
		h.sync(id) // best-effort calendar sync (non-blocking)
	}
	row, err := h.getSession(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func joinAnd(parts []string) string  { return joinWith(parts, " AND ") }
func joinComma(parts []string) string { return joinWith(parts, ", ") }
func joinWith(parts []string, sep string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += sep
		}
		out += p
	}
	return out
}

func sp(s string) *string { return &s }
