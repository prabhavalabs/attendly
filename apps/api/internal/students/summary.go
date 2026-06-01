package students

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/httpapi"
	"attendly/api/internal/store"
)

// summary returns the KPIs shown on the student detail hero: attendance rate,
// outstanding balance, enrolled-class count, and fee status.
func (h *Handlers) summary(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if err := h.requireStudent(r.Context(), id); err != nil {
		return err
	}
	ctx := r.Context()

	scalar := func(q string, args ...any) (int64, error) {
		var n int64
		err := h.db.QueryRowContext(ctx, q, args...).Scan(&n)
		if err == sql.ErrNoRows {
			return 0, nil
		}
		return n, err
	}

	enrolled, err := scalar(`SELECT COUNT(*) FROM enrollments WHERE student_id = ? AND status = 'active'`, id)
	if err != nil {
		return err
	}
	outstanding, err := scalar(
		`SELECT COALESCE(SUM(i.amount_minor - (SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.invoice_id = i.id)), 0)
		   FROM invoices i WHERE i.student_id = ? AND i.status IN ('pending','partial','overdue')`, id)
	if err != nil {
		return err
	}
	overdue, err := scalar(`SELECT COUNT(*) FROM invoices WHERE student_id = ? AND status = 'overdue'`, id)
	if err != nil {
		return err
	}
	present, err := scalar(`SELECT COUNT(*) FROM attendance WHERE student_id = ? AND status IN ('present','late')`, id)
	if err != nil {
		return err
	}
	expected, err := scalar(
		`SELECT COUNT(*) FROM class_sessions cs WHERE cs.status IN ('open','closed')
		   AND cs.class_id IN (SELECT class_id FROM enrollments WHERE student_id = ? AND status = 'active')`, id)
	if err != nil {
		return err
	}

	var rate *float64
	if expected > 0 {
		v := float64(present) / float64(expected)
		rate = &v
	}
	feeStatus := "paid"
	if outstanding > 0 {
		feeStatus = "due"
		if overdue > 0 {
			feeStatus = "overdue"
		}
	}

	httpapi.JSON(w, http.StatusOK, map[string]any{
		"attendance_rate":   rate,
		"outstanding_minor": outstanding,
		"enrolled_count":    enrolled,
		"fee_status":        feeStatus,
	})
	return nil
}

// attendanceCode maps a stored status to the heatmap code used by the UI.
func attendanceCode(status string) string {
	switch status {
	case "present":
		return "p"
	case "late":
		return "l"
	case "excused":
		return "x"
	default:
		return "a"
	}
}

var codeRank = map[string]int{"p": 4, "l": 3, "x": 2, "a": 1, "": 0}

// attendance returns a 35-day heatmap (one code per day) + recent sessions for
// the student's enrolled classes.
func (h *Handlers) attendance(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if err := h.requireStudent(r.Context(), id); err != nil {
		return err
	}
	ctx := r.Context()

	const days = 35
	start := time.Now().UTC().AddDate(0, 0, -(days - 1)).Format("2006-01-02")

	// Best status per day across the student's enrolled-class sessions.
	rows, err := h.db.QueryContext(ctx,
		`SELECT cs.session_date, COALESCE(a.status, 'absent') AS status
		   FROM class_sessions cs
		   JOIN enrollments e ON e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'active'
		   LEFT JOIN attendance a ON a.session_id = cs.id AND a.student_id = ?
		  WHERE cs.status IN ('open','closed') AND cs.session_date >= ?`, id, id, start)
	if err != nil {
		return err
	}
	byDay := map[string]string{}
	for rows.Next() {
		var date, status string
		if err := rows.Scan(&date, &status); err != nil {
			rows.Close()
			return err
		}
		code := attendanceCode(status)
		if codeRank[code] > codeRank[byDay[date]] {
			byDay[date] = code
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	heat := make([]string, days)
	base := time.Now().UTC().AddDate(0, 0, -(days - 1))
	for i := 0; i < days; i++ {
		heat[i] = byDay[base.AddDate(0, 0, i).Format("2006-01-02")]
	}

	recent, err := store.QueryMaps(ctx, h.db,
		`SELECT cs.session_date, cs.start_time, c.name AS class_name,
		        COALESCE(a.status, 'absent') AS status, a.method, a.checked_in_at
		   FROM class_sessions cs
		   JOIN classes c ON c.id = cs.class_id
		   JOIN enrollments e ON e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'active'
		   LEFT JOIN attendance a ON a.session_id = cs.id AND a.student_id = ?
		  WHERE cs.status IN ('open','closed')
		  ORDER BY cs.session_date DESC, cs.start_time DESC LIMIT 10`, id, id)
	if err != nil {
		return err
	}

	httpapi.JSON(w, http.StatusOK, map[string]any{"heatmap": heat, "recent": recent})
	return nil
}
