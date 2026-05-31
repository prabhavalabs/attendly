// Package billing holds money/invoice logic ported from the Worker: defaulter
// computation and receipt numbering. Money is always integer minor units.
package billing

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"attendly/api/internal/store"
)

// DefaulterStudent is the student summary on a defaulter row.
type DefaulterStudent struct {
	ID         string  `json:"id"`
	RegNo      string  `json:"reg_no"`
	FullName   string  `json:"full_name"`
	Phone      *string `json:"phone"`
	PhotoURL   *string `json:"photo_url"`
	Status     string  `json:"status"`
	CardStatus string  `json:"card_status"`
}

// Defaulter aggregates a student's outstanding balance across invoices.
type Defaulter struct {
	Student         DefaulterStudent `json:"student"`
	OutstandingMinor int64           `json:"outstanding_minor"`
	OverduePeriods   []string        `json:"overdue_periods"`
	InvoiceCount     int             `json:"invoice_count"`
}

// ComputeDefaulters returns students with a positive outstanding balance,
// sorted by amount outstanding (descending).
func ComputeDefaulters(ctx context.Context, db store.Queryer) ([]Defaulter, error) {
	rows, err := db.QueryContext(ctx,
		`SELECT s.id, s.reg_no, s.full_name, s.phone, s.photo_url, s.status, s.card_status,
		        i.period, i.amount_minor, i.status AS inv_status,
		        (SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid
		   FROM invoices i
		   JOIN students s ON s.id = i.student_id AND s.deleted_at IS NULL
		  WHERE i.status IN ('pending', 'partial', 'overdue')
		  ORDER BY s.name_normalized`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byStudent := make(map[string]*Defaulter)
	order := make([]string, 0, 16)
	for rows.Next() {
		var (
			id, regNo, fullName, status, cardStatus, period, invStatus string
			phone, photoURL                                            sql.NullString
			amount, paid                                               int64
		)
		if err := rows.Scan(&id, &regNo, &fullName, &phone, &photoURL, &status, &cardStatus, &period, &amount, &invStatus, &paid); err != nil {
			return nil, err
		}
		d, ok := byStudent[id]
		if !ok {
			d = &Defaulter{
				Student: DefaulterStudent{
					ID: id, RegNo: regNo, FullName: fullName,
					Phone: nullStr(phone), PhotoURL: nullStr(photoURL),
					Status: status, CardStatus: cardStatus,
				},
				OverduePeriods: []string{},
			}
			byStudent[id] = d
			order = append(order, id)
		}
		if due := amount - paid; due > 0 {
			d.OutstandingMinor += due
		}
		if invStatus == "overdue" {
			d.OverduePeriods = append(d.OverduePeriods, period)
		}
		d.InvoiceCount++
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]Defaulter, 0, len(order))
	for _, id := range order {
		if d := byStudent[id]; d.OutstandingMinor > 0 {
			out = append(out, *d)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].OutstandingMinor > out[j].OutstandingMinor })
	return out, nil
}

// NextReceiptNo returns the next sequential receipt number for the payment's
// month: RC-YYYYMM-NNNN.
func NextReceiptNo(ctx context.Context, db store.Queryer, paidAtISO string) (string, error) {
	ym := strings.ReplaceAll(paidAtISO[:7], "-", "") // YYYYMM
	prefix := fmt.Sprintf("RC-%s-", ym)
	var last string
	err := db.QueryRowContext(ctx,
		`SELECT receipt_no FROM payments WHERE receipt_no LIKE ? ORDER BY receipt_no DESC LIMIT 1`,
		prefix+"%",
	).Scan(&last)
	next := 1
	if err == nil {
		if n, perr := strconv.Atoi(strings.TrimPrefix(last, prefix)); perr == nil {
			next = n + 1
		}
	} else if err != sql.ErrNoRows {
		return "", err
	}
	return fmt.Sprintf("%s%04d", prefix, next), nil
}

func nullStr(n sql.NullString) *string {
	if !n.Valid {
		return nil
	}
	return &n.String
}
