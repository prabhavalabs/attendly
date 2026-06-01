// Package notifications serves notification list/create (notification.send).
// Delivery providers land later; this records intent + recipient counts.
package notifications

import (
	"context"
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/auth"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/store"
)

const cols = `id, type, title, body, channel, audience, class_id, student_id,
	recipient_count, status, scheduled_at, sent_at, created_at`

// Handlers serves the notifications domain.
type Handlers struct{ db *sql.DB }

// New constructs the notifications handlers.
func New(db *sql.DB) *Handlers { return &Handlers{db: db} }

// Mount registers /api/notifications (notification.send).
func (h *Handlers) Mount(r chi.Router) {
	send := auth.RequirePermission("notification.send")
	r.Route("/api/notifications", func(r chi.Router) {
		r.With(send).Method(http.MethodGet, "/", httpapi.Handler(h.list))
		r.With(send).Method(http.MethodPost, "/", httpapi.Handler(h.create))
	})
}

func (h *Handlers) recipientCount(ctx context.Context, audience string, classID, studentID *string) (int64, error) {
	var n int64
	switch {
	case audience == "all_students":
		return n, h.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM students WHERE status = 'active' AND deleted_at IS NULL`).Scan(&n)
	case audience == "all_guardians":
		return n, h.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM guardians`).Scan(&n)
	case audience == "class" && classID != nil:
		return n, h.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM enrollments WHERE class_id = ? AND status = 'active'`, *classID).Scan(&n)
	case audience == "student":
		return 1, nil
	}
	return 0, nil
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	rows, err := store.QueryMaps(r.Context(), h.db, `SELECT `+cols+` FROM notifications ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"notifications": rows})
	return nil
}

func (h *Handlers) create(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Type        string  `json:"type"`
		Title       string  `json:"title"`
		Body        string  `json:"body"`
		Channel     string  `json:"channel"`
		Audience    string  `json:"audience"`
		ClassID     *string `json:"class_id"`
		StudentID   *string `json:"student_id"`
		ScheduledAt *string `json:"scheduled_at"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if in.Type == "" || in.Title == "" || in.Body == "" || in.Channel == "" || in.Audience == "" {
		return httpapi.BadRequest("invalid_body")
	}
	now := cryptox.NowISO()
	id := cryptox.NewID("ntf")
	count, err := h.recipientCount(r.Context(), in.Audience, in.ClassID, in.StudentID)
	if err != nil {
		return err
	}

	var scheduled, sentAt *string
	status := "sent"
	if in.ScheduledAt != nil && *in.ScheduledAt > now {
		scheduled = in.ScheduledAt
		status = "queued"
	} else {
		sentAt = &now
	}

	actor := auth.MustUser(r.Context()).ID
	if _, err := h.db.ExecContext(r.Context(),
		`INSERT INTO notifications
		   (id, type, title, body, channel, audience, class_id, student_id, recipient_count, status, scheduled_at, sent_at, created_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Type, in.Title, in.Body, in.Channel, in.Audience, in.ClassID, in.StudentID, count, status, scheduled, sentAt, actor, now, now); err != nil {
		return err
	}
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "notification.send", EntityType: sp("notification"), EntityID: &id, After: map[string]any{"audience": in.Audience, "status": status, "recipient_count": count}})

	row, err := store.QueryFirstMap(r.Context(), h.db, `SELECT `+cols+` FROM notifications WHERE id = ?`, id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusCreated, row)
	return nil
}

func sp(s string) *string { return &s }
