// Package reports serves defaulter, attendance and revenue reports with
// optional CSV export (report.read / report.export).
package reports

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/auth"
	"attendly/api/internal/billing"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/rbac"
)

// Handlers serves the reports domain.
type Handlers struct{ db *sql.DB }

// New constructs the reports handlers.
func New(db *sql.DB) *Handlers { return &Handlers{db: db} }

// Mount registers report routes (Authenticate applied upstream).
func (h *Handlers) Mount(r chi.Router) {
	read := auth.RequirePermission("report.read")
	r.Route("/api/reports", func(r chi.Router) {
		r.With(read).Method(http.MethodGet, "/defaulters", httpapi.Handler(h.defaulters))
		r.With(read).Method(http.MethodGet, "/attendance", httpapi.Handler(h.attendance))
		r.With(read).Method(http.MethodGet, "/revenue", httpapi.Handler(h.revenue))
	})
}

func lkr(minor int64) string { return fmt.Sprintf("%.2f", float64(minor)/100) }

func defaultRange() (string, string) {
	to := cryptox.NowISO()[:10]
	from := time.Now().UTC().Add(-30 * 24 * time.Hour).Format("2006-01-02")
	return from, to
}

func (h *Handlers) ensureExport(r *http.Request) error {
	if !rbac.HasPermission(auth.MustUser(r.Context()).Permissions, "report.export") {
		return httpapi.Forbidden("forbidden")
	}
	return nil
}

func writeCSV(w http.ResponseWriter, filename string, headers []string, rows [][]string) error {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	cw := csv.NewWriter(w)
	_ = cw.Write(headers)
	_ = cw.WriteAll(rows)
	cw.Flush()
	return cw.Error()
}

func (h *Handlers) defaulters(w http.ResponseWriter, r *http.Request) error {
	ds, err := billing.ComputeDefaulters(r.Context(), h.db)
	if err != nil {
		return err
	}
	if r.URL.Query().Get("format") == "csv" {
		if err := h.ensureExport(r); err != nil {
			return err
		}
		rows := make([][]string, 0, len(ds))
		for _, d := range ds {
			rows = append(rows, []string{d.Student.RegNo, d.Student.FullName, lkr(d.OutstandingMinor), joinSpace(d.OverduePeriods), fmt.Sprint(d.InvoiceCount)})
		}
		return writeCSV(w, "defaulters.csv", []string{"reg_no", "name", "outstanding_lkr", "overdue_periods", "unpaid_invoices"}, rows)
	}
	// JSON path is paginated; CSV export above returns the full set.
	total := len(ds)
	p := httpapi.ParsePage(r)
	start := p.Offset
	if start > total {
		start = total
	}
	end := start + p.Limit
	if end > total {
		end = total
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"defaulters": ds[start:end], "total": total, "page": p.Page, "page_size": p.PageSize})
	return nil
}

type attendanceRow struct {
	ClassID   string   `json:"class_id"`
	ClassName string   `json:"class_name"`
	Code      string   `json:"code"`
	Band      string   `json:"band"`
	Sessions  int64    `json:"sessions"`
	Present   int64    `json:"present"`
	Expected  int64    `json:"expected"`
	Rate      *float64 `json:"rate"`
}

func (h *Handlers) attendanceRows(ctx context.Context, from, to string) ([]attendanceRow, error) {
	rows, err := h.db.QueryContext(ctx,
		`SELECT c.id, c.name, c.code, c.band,
		        (SELECT COUNT(*) FROM class_sessions cs WHERE cs.class_id = c.id AND cs.session_date BETWEEN ? AND ? AND cs.status IN ('open','closed')) AS sessions,
		        (SELECT COUNT(*) FROM attendance a JOIN class_sessions cs ON cs.id = a.session_id
		           WHERE cs.class_id = c.id AND cs.session_date BETWEEN ? AND ? AND a.status IN ('present','late')) AS present,
		        (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active') AS enrolled
		   FROM classes c WHERE c.deleted_at IS NULL ORDER BY c.name`, from, to, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []attendanceRow{}
	for rows.Next() {
		var a attendanceRow
		var enrolled int64
		if err := rows.Scan(&a.ClassID, &a.ClassName, &a.Code, &a.Band, &a.Sessions, &a.Present, &enrolled); err != nil {
			return nil, err
		}
		a.Expected = a.Sessions * enrolled
		if a.Expected > 0 {
			rate := float64(a.Present) / float64(a.Expected)
			a.Rate = &rate
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (h *Handlers) attendance(w http.ResponseWriter, r *http.Request) error {
	from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	df, dt := defaultRange()
	if from == "" {
		from = df
	}
	if to == "" {
		to = dt
	}
	rows, err := h.attendanceRows(r.Context(), from, to)
	if err != nil {
		return err
	}
	if r.URL.Query().Get("format") == "csv" {
		if err := h.ensureExport(r); err != nil {
			return err
		}
		out := make([][]string, 0, len(rows))
		for _, a := range rows {
			ratePct := ""
			if a.Rate != nil {
				ratePct = fmt.Sprintf("%.1f", *a.Rate*100)
			}
			out = append(out, []string{a.ClassName, a.Code, fmt.Sprint(a.Sessions), fmt.Sprint(a.Present), fmt.Sprint(a.Expected), ratePct})
		}
		return writeCSV(w, "attendance.csv", []string{"class", "code", "sessions", "present", "expected", "rate_pct"}, out)
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"rows": rows, "from": from, "to": to})
	return nil
}

type revenueRow struct {
	Period         string `json:"period"`
	BilledMinor    int64  `json:"billed_minor"`
	CollectedMinor int64  `json:"collected_minor"`
}

func (h *Handlers) revenueRows(ctx context.Context) ([]revenueRow, error) {
	byPeriod := map[string]*revenueRow{}
	order := func(p string) *revenueRow {
		if e, ok := byPeriod[p]; ok {
			return e
		}
		e := &revenueRow{Period: p}
		byPeriod[p] = e
		return e
	}
	billed, err := h.db.QueryContext(ctx, `SELECT period, SUM(CASE WHEN status != 'waived' THEN amount_minor ELSE 0 END) FROM invoices GROUP BY period`)
	if err != nil {
		return nil, err
	}
	for billed.Next() {
		var p string
		var n sql.NullInt64
		if err := billed.Scan(&p, &n); err != nil {
			billed.Close()
			return nil, err
		}
		order(p).BilledMinor = n.Int64
	}
	billed.Close()
	collected, err := h.db.QueryContext(ctx, `SELECT i.period, SUM(p.amount_minor) FROM payments p JOIN invoices i ON i.id = p.invoice_id GROUP BY i.period`)
	if err != nil {
		return nil, err
	}
	for collected.Next() {
		var p string
		var n sql.NullInt64
		if err := collected.Scan(&p, &n); err != nil {
			collected.Close()
			return nil, err
		}
		order(p).CollectedMinor = n.Int64
	}
	collected.Close()

	out := make([]revenueRow, 0, len(byPeriod))
	for _, e := range byPeriod {
		out = append(out, *e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Period > out[j].Period })
	return out, nil
}

func (h *Handlers) revenue(w http.ResponseWriter, r *http.Request) error {
	rows, err := h.revenueRows(r.Context())
	if err != nil {
		return err
	}
	if r.URL.Query().Get("format") == "csv" {
		if err := h.ensureExport(r); err != nil {
			return err
		}
		out := make([][]string, 0, len(rows))
		for _, rv := range rows {
			out = append(out, []string{rv.Period, lkr(rv.BilledMinor), lkr(rv.CollectedMinor)})
		}
		return writeCSV(w, "revenue.csv", []string{"period", "billed_lkr", "collected_lkr"}, out)
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"rows": rows})
	return nil
}

func joinSpace(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += " "
		}
		out += p
	}
	return out
}
