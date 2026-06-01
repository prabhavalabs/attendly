// Package attendance is the shared attendance core (SRS §7.4): student
// resolution, idempotent recording, and the informational payment alert.
// Used by both /api/checkin and the admin roster.
package attendance

import (
	"context"
	"database/sql"

	"attendly/api/internal/cryptox"
	"attendly/api/internal/store"
)

// Student is a resolved student (the subset returned by check-in).
type Student struct {
	ID       string  `json:"id"`
	RegNo    string  `json:"reg_no"`
	FullName string  `json:"full_name"`
	PhotoURL *string `json:"photo_url"`
}

// Identifier carries exactly one of the supported lookup keys.
type Identifier struct {
	CardToken string
	StudentID string
	RegNo     string
}

// Resolve finds a student by student_id, then card_token (active cards only),
// then reg_no. Returns (nil, nil) when nothing matches.
func Resolve(ctx context.Context, db *sql.DB, id Identifier) (*Student, error) {
	const cols = `id, reg_no, full_name, photo_url`
	var (
		query string
		arg   string
	)
	switch {
	case id.StudentID != "":
		query = `SELECT ` + cols + ` FROM students WHERE id = ? AND deleted_at IS NULL`
		arg = id.StudentID
	case id.CardToken != "":
		query = `SELECT ` + cols + ` FROM students WHERE card_token = ? AND card_status = 'active' AND deleted_at IS NULL`
		arg = id.CardToken
	case id.RegNo != "":
		query = `SELECT ` + cols + ` FROM students WHERE reg_no = ? AND deleted_at IS NULL`
		arg = id.RegNo
	default:
		return nil, nil
	}

	var s Student
	var photo sql.NullString
	err := db.QueryRowContext(ctx, query, arg).Scan(&s.ID, &s.RegNo, &s.FullName, &photo)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if photo.Valid {
		s.PhotoURL = &photo.String
	}
	return &s, nil
}

// RecordResult is the outcome of recording attendance.
type RecordResult struct {
	Status    string `json:"status"`
	Method    string `json:"method"`
	Duplicate bool   `json:"duplicate"`
}

// RecordOpts are the inputs to Record.
type RecordOpts struct {
	SessionID      string
	StudentID      string
	Status         string
	Method         string
	ClientDedupKey string
	CheckedInAt    string
	ActorID        string
}

// Record writes attendance idempotently (SRS §7.4):
//   - a seen client_dedup_key returns the prior result (offline replay)
//   - manual marks update an existing row (edit prior record, audited)
//   - qr/nfc/search are first-write-wins (duplicate flagged, never an error)
func Record(ctx context.Context, db *sql.DB, o RecordOpts) (RecordResult, error) {
	now := cryptox.NowISO()
	checkedInAt := o.CheckedInAt
	if checkedInAt == "" {
		checkedInAt = now
	}
	var actor *string
	if o.ActorID != "" {
		actor = &o.ActorID
	}

	if o.ClientDedupKey != "" {
		var status, method string
		err := db.QueryRowContext(ctx, `SELECT status, method FROM attendance WHERE client_dedup_key = ?`, o.ClientDedupKey).Scan(&status, &method)
		if err == nil {
			return RecordResult{Status: status, Method: method, Duplicate: true}, nil
		}
		if err != sql.ErrNoRows {
			return RecordResult{}, err
		}
	}

	var existingID, existingStatus, existingMethod string
	err := db.QueryRowContext(ctx, `SELECT id, status, method FROM attendance WHERE session_id = ? AND student_id = ?`, o.SessionID, o.StudentID).
		Scan(&existingID, &existingStatus, &existingMethod)
	hasExisting := err == nil
	if err != nil && err != sql.ErrNoRows {
		return RecordResult{}, err
	}

	if hasExisting {
		if o.Method == "manual" {
			if _, err := db.ExecContext(ctx,
				`UPDATE attendance SET status = ?, method = 'manual', recorded_by = ?, checked_in_at = ?, updated_at = ? WHERE id = ?`,
				o.Status, actor, checkedInAt, now, existingID); err != nil {
				return RecordResult{}, err
			}
			_ = store.WriteAudit(ctx, db, store.AuditEntry{ActorID: actor, Action: "attendance.update", EntityType: sp("attendance"), EntityID: &existingID,
				Before: map[string]any{"status": existingStatus}, After: map[string]any{"status": o.Status}})
			return RecordResult{Status: o.Status, Method: "manual", Duplicate: false}, nil
		}
		return RecordResult{Status: existingStatus, Method: existingMethod, Duplicate: true}, nil
	}

	id := cryptox.NewID("att")
	var dedup *string
	if o.ClientDedupKey != "" {
		dedup = &o.ClientDedupKey
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO attendance (id, session_id, student_id, status, method, client_dedup_key, recorded_by, checked_in_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, o.SessionID, o.StudentID, o.Status, o.Method, dedup, actor, checkedInAt, now, now); err != nil {
		return RecordResult{}, err
	}
	_ = store.WriteAudit(ctx, db, store.AuditEntry{ActorID: actor, Action: "attendance.record", EntityType: sp("attendance"), EntityID: &id,
		After: map[string]any{"session_id": o.SessionID, "student_id": o.StudentID, "status": o.Status, "method": o.Method}})
	return RecordResult{Status: o.Status, Method: o.Method, Duplicate: false}, nil
}

// PaymentAlert is the informational outstanding-balance alert (never blocks).
type PaymentAlert struct {
	HasOutstanding   bool     `json:"has_outstanding"`
	OverduePeriods   []string `json:"overdue_periods"`
	OutstandingMinor int64    `json:"outstanding_minor"`
}

// Alert sums outstanding across the student's unpaid invoices.
func Alert(ctx context.Context, db *sql.DB, studentID string) (PaymentAlert, error) {
	rows, err := db.QueryContext(ctx,
		`SELECT i.period, i.amount_minor, i.status,
		        (SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid
		   FROM invoices i WHERE i.student_id = ? AND i.status IN ('pending', 'partial', 'overdue')`, studentID)
	if err != nil {
		return PaymentAlert{}, err
	}
	defer rows.Close()
	out := PaymentAlert{OverduePeriods: []string{}}
	for rows.Next() {
		var period, status string
		var amount, paid int64
		if err := rows.Scan(&period, &amount, &status, &paid); err != nil {
			return PaymentAlert{}, err
		}
		if due := amount - paid; due > 0 {
			out.OutstandingMinor += due
		}
		if status == "overdue" {
			out.OverduePeriods = append(out.OverduePeriods, period)
		}
	}
	out.HasOutstanding = out.OutstandingMinor > 0
	return out, rows.Err()
}

func sp(s string) *string { return &s }
