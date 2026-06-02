// Package checkin serves single + batch check-in (SRS §6.4). Idempotent and
// non-blocking: duplicates are flagged, payment alerts never block check-in.
package checkin

import (
	"context"
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/attendance"
	"attendly/api/internal/auth"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
)

// Handlers serves the check-in domain.
type Handlers struct{ db *sql.DB }

// New constructs the check-in handlers.
func New(db *sql.DB) *Handlers { return &Handlers{db: db} }

// Mount registers /api/checkin and /api/checkin/batch (attendance.record).
func (h *Handlers) Mount(r chi.Router) {
	rec := auth.RequirePermission("attendance.record")
	r.With(rec).Method(http.MethodPost, "/api/checkin", httpapi.Handler(h.single))
	r.With(rec).Method(http.MethodPost, "/api/checkin/batch", httpapi.Handler(h.batch))
}

type checkinInput struct {
	SessionID      string `json:"session_id"`
	CardToken      string `json:"card_token"`
	StudentID      string `json:"student_id"`
	RegNo          string `json:"reg_no"`
	Method         string `json:"method"`
	Status         string `json:"status"`
	ClientDedupKey string `json:"client_dedup_key"`
	CheckedInAt    string `json:"checked_in_at"`
}

type result struct {
	OK             bool                     `json:"ok"`
	ClientDedupKey *string                  `json:"client_dedup_key"`
	Student        *attendance.Student      `json:"student"`
	Attendance     *attendance.RecordResult `json:"attendance"`
	PaymentAlert   *attendance.PaymentAlert `json:"payment_alert"`
	Error          string                   `json:"error,omitempty"`
}

func dedupPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func (h *Handlers) processOne(ctx context.Context, actorID string, in checkinInput) (result, error) {
	key := dedupPtr(in.ClientDedupKey)
	if in.Method == "" {
		in.Method = "manual"
	}
	if in.Status == "" {
		in.Status = "present"
	}

	var sessID, sessStatus string
	err := h.db.QueryRowContext(ctx, `SELECT id, status FROM class_sessions WHERE id = ?`, in.SessionID).Scan(&sessID, &sessStatus)
	if err == sql.ErrNoRows {
		return result{OK: false, Error: "session_not_found", ClientDedupKey: key}, nil
	}
	if err != nil {
		return result{}, err
	}

	student, err := attendance.Resolve(ctx, h.db, attendance.Identifier{CardToken: in.CardToken, StudentID: in.StudentID, RegNo: in.RegNo})
	if err != nil {
		return result{}, err
	}
	if student == nil {
		return result{OK: false, Error: "student_not_found", ClientDedupKey: key}, nil
	}

	rec, err := attendance.Record(ctx, h.db, attendance.RecordOpts{
		SessionID: in.SessionID, StudentID: student.ID, Status: in.Status, Method: in.Method,
		ClientDedupKey: in.ClientDedupKey, CheckedInAt: in.CheckedInAt, ActorID: actorID,
	})
	if err != nil {
		return result{}, err
	}

	// Taking attendance means the session is live: promote scheduled → open so the
	// mark counts toward every attendance stat (student %, heatmap, recent,
	// dashboard, reports), which all filter to status IN ('open','closed').
	// Idempotent and safe to repeat; closed/cancelled sessions are left untouched.
	if sessStatus == "scheduled" {
		if _, err := h.db.ExecContext(ctx,
			`UPDATE class_sessions SET status = 'open', updated_at = ? WHERE id = ? AND status = 'scheduled'`,
			cryptox.NowISO(), in.SessionID); err != nil {
			return result{}, err
		}
	}

	alert, err := attendance.Alert(ctx, h.db, student.ID)
	if err != nil {
		return result{}, err
	}
	return result{OK: true, ClientDedupKey: key, Student: student, Attendance: &rec, PaymentAlert: &alert}, nil
}

func (h *Handlers) single(w http.ResponseWriter, r *http.Request) error {
	var in checkinInput
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if in.SessionID == "" {
		return httpapi.BadRequest("invalid_body")
	}
	res, err := h.processOne(r.Context(), auth.MustUser(r.Context()).ID, in)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, res)
	return nil
}

func (h *Handlers) batch(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Items []checkinInput `json:"items"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if len(in.Items) == 0 || len(in.Items) > 500 {
		return httpapi.BadRequest("invalid_body")
	}
	actor := auth.MustUser(r.Context()).ID
	results := make([]result, 0, len(in.Items))
	for _, item := range in.Items {
		res, err := h.processOne(r.Context(), actor, item)
		if err != nil {
			return err
		}
		results = append(results, res)
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"results": results})
	return nil
}
