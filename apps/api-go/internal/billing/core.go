package billing

import (
	"context"
	"database/sql"

	"attendly/api/internal/cryptox"
)

// Today returns the current UTC date as YYYY-MM-DD.
func Today() string { return cryptox.NowISO()[:10] }

// GenerateOpts parameterizes invoice generation.
type GenerateOpts struct {
	Period  string // YYYY-MM
	DueDate string // optional; defaults to <period>-10
	ClassID string // optional; restrict to one class
}

// GenerateInvoices creates pending invoices for active enrollments of active
// classes. Idempotent on (student_id, class_id, period); returns the count.
func GenerateInvoices(ctx context.Context, db *sql.DB, o GenerateOpts) (int, error) {
	dueDate := o.DueDate
	if dueDate == "" {
		dueDate = o.Period + "-10"
	}
	query := `SELECT e.student_id, e.class_id, COALESCE(e.fee_override_minor, c.fee_minor) AS amount
	            FROM enrollments e
	            JOIN classes c ON c.id = e.class_id AND c.deleted_at IS NULL AND c.status = 'active'
	            JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
	           WHERE e.status = 'active'`
	args := []any{}
	if o.ClassID != "" {
		query += " AND e.class_id = ?"
		args = append(args, o.ClassID)
	}
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	type bill struct {
		studentID, classID string
		amount             int64
	}
	var bills []bill
	for rows.Next() {
		var b bill
		if err := rows.Scan(&b.studentID, &b.classID, &b.amount); err != nil {
			rows.Close()
			return 0, err
		}
		bills = append(bills, b)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	now := cryptox.NowISO()
	created := 0
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()
	for _, b := range bills {
		if b.amount <= 0 {
			continue // free classes don't bill
		}
		res, err := tx.ExecContext(ctx,
			`INSERT OR IGNORE INTO invoices (id, student_id, class_id, period, amount_minor, due_date, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
			cryptox.NewID("inv"), b.studentID, b.classID, o.Period, b.amount, dueDate, now, now)
		if err != nil {
			return 0, err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			created++
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return created, nil
}

func paidFor(ctx context.Context, db *sql.DB, invoiceID string) (int64, error) {
	var paid int64
	err := db.QueryRowContext(ctx, `SELECT COALESCE(SUM(amount_minor), 0) FROM payments WHERE invoice_id = ?`, invoiceID).Scan(&paid)
	return paid, err
}

// RecomputeInvoiceStatus derives an invoice's status from its payments (a
// waived invoice is sticky and left unchanged).
func RecomputeInvoiceStatus(ctx context.Context, db *sql.DB, invoiceID string) error {
	var amount int64
	var dueDate, status string
	err := db.QueryRowContext(ctx, `SELECT amount_minor, due_date, status FROM invoices WHERE id = ?`, invoiceID).Scan(&amount, &dueDate, &status)
	if err == sql.ErrNoRows || status == "waived" {
		return nil
	}
	if err != nil {
		return err
	}
	paid, err := paidFor(ctx, db, invoiceID)
	if err != nil {
		return err
	}
	switch {
	case paid >= amount:
		status = "paid"
	case dueDate < Today():
		status = "overdue"
	case paid > 0:
		status = "partial"
	default:
		status = "pending"
	}
	_, err = db.ExecContext(ctx, `UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?`, status, cryptox.NowISO(), invoiceID)
	return err
}

// MarkOverdue flips pending/partial invoices to overdue once past due. Returns
// the number updated.
func MarkOverdue(ctx context.Context, db *sql.DB) (int, error) {
	res, err := db.ExecContext(ctx,
		`UPDATE invoices SET status = 'overdue', updated_at = ? WHERE status IN ('pending', 'partial') AND due_date < ?`,
		cryptox.NowISO(), Today())
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}
