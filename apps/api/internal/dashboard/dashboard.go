// Package dashboard serves the operations summary (KPIs, today's sessions,
// defaulters, recent activity). Requires only authentication.
package dashboard

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/billing"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/store"
)

// Handlers serves the dashboard endpoint.
type Handlers struct{ db *sql.DB }

// New constructs the dashboard handlers.
func New(db *sql.DB) *Handlers { return &Handlers{db: db} }

// Mount registers GET /api/dashboard (Authenticate applied upstream).
func (h *Handlers) Mount(r chi.Router) {
	r.Method(http.MethodGet, "/api/dashboard", httpapi.Handler(h.get))
}

func (h *Handlers) scalar(ctx context.Context, query string, args ...any) (int64, error) {
	var n int64
	err := h.db.QueryRowContext(ctx, query, args...).Scan(&n)
	if err != nil && err != sql.ErrNoRows {
		return 0, err
	}
	return n, nil
}

func (h *Handlers) get(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	today := cryptox.NowISO()[:10]
	since := time.Now().UTC().Add(-30 * 24 * time.Hour).Format("2006-01-02")

	active, err := h.scalar(ctx, `SELECT COUNT(*) FROM students WHERE status = 'active' AND deleted_at IS NULL`)
	if err != nil {
		return err
	}
	todayCount, err := h.scalar(ctx, `SELECT COUNT(*) FROM class_sessions WHERE session_date = ?`, today)
	if err != nil {
		return err
	}
	outstanding, err := h.scalar(ctx,
		`SELECT COALESCE(SUM(i.amount_minor - (SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.invoice_id = i.id)), 0)
		   FROM invoices i WHERE i.status IN ('pending', 'partial', 'overdue')`)
	if err != nil {
		return err
	}
	present, err := h.scalar(ctx,
		`SELECT COUNT(*) FROM attendance a JOIN class_sessions cs ON cs.id = a.session_id
		  WHERE cs.session_date >= ? AND a.status IN ('present', 'late')`, since)
	if err != nil {
		return err
	}
	expected, err := h.scalar(ctx,
		`SELECT COALESCE(SUM((SELECT COUNT(*) FROM enrollments e WHERE e.class_id = cs.class_id AND e.status = 'active')), 0)
		   FROM class_sessions cs WHERE cs.session_date >= ? AND cs.session_date <= ? AND cs.status IN ('open', 'closed')`,
		since, today)
	if err != nil {
		return err
	}
	var attendanceRate *float64
	if expected > 0 {
		rate := float64(present) / float64(expected)
		attendanceRate = &rate
	}

	todaySessions, err := store.QueryMaps(ctx, h.db,
		`SELECT cs.id, c.name AS class_name, c.code, c.band, cs.start_time, cs.end_time, cs.status,
		        (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = cs.class_id AND e.status = 'active') AS enrolled_count,
		        (SELECT COUNT(*) FROM attendance a WHERE a.session_id = cs.id AND a.status IN ('present', 'late')) AS present_count
		   FROM class_sessions cs JOIN classes c ON c.id = cs.class_id
		  WHERE cs.session_date = ? ORDER BY cs.start_time`, today)
	if err != nil {
		return err
	}
	activity, err := store.QueryMaps(ctx, h.db,
		`SELECT a.id, a.action, a.entity_type, a.created_at, u.name AS actor_name
		   FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
		  ORDER BY a.created_at DESC LIMIT 8`)
	if err != nil {
		return err
	}

	defaulters, err := billing.ComputeDefaulters(ctx, h.db)
	if err != nil {
		return err
	}
	if len(defaulters) > 5 {
		defaulters = defaulters[:5]
	}

	httpapi.JSON(w, http.StatusOK, map[string]any{
		"summary": map[string]any{
			"active_students":   active,
			"today_sessions":    todayCount,
			"outstanding_minor": outstanding,
			"attendance_rate":   attendanceRate,
		},
		"today":          todaySessions,
		"defaulters_top": defaulters,
		"activity":       activity,
	})
	return nil
}
