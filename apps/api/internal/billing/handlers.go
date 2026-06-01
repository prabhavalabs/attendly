package billing

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/auth"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/pdfgen"
	"attendly/api/internal/store"
)

const invoiceSelect = `
	SELECT i.id, i.student_id, s.full_name AS student_name, s.reg_no, s.photo_url,
	       i.class_id, c.name AS class_name, c.code,
	       i.period, i.amount_minor, i.due_date, i.status, i.waived_reason, i.created_at,
	       (SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid_minor
	  FROM invoices i
	  JOIN students s ON s.id = i.student_id
	  JOIN classes c ON c.id = i.class_id`

// Handlers serves the billing domain (invoices + payments).
type Handlers struct{ db *sql.DB }

// NewHandlers constructs the billing HTTP handlers.
func NewHandlers(db *sql.DB) *Handlers { return &Handlers{db: db} }

// Mount registers /api/invoices and /api/payments (Authenticate upstream).
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/api/invoices", func(r chi.Router) {
		r.With(auth.RequirePermission("invoice.read")).Method(http.MethodGet, "/", httpapi.Handler(h.listInvoices))
		manage := auth.RequirePermission("invoice.manage")
		r.With(manage).Method(http.MethodPost, "/generate", httpapi.Handler(h.generate))
		r.With(manage).Method(http.MethodPatch, "/{id}", httpapi.Handler(h.patchInvoice))
	})
	r.Route("/api/payments", func(r chi.Router) {
		r.With(auth.RequirePermission("payment.read")).Method(http.MethodGet, "/", httpapi.Handler(h.listPayments))
		r.With(auth.RequirePermission("payment.record")).Method(http.MethodPost, "/", httpapi.Handler(h.createPayment))
		r.With(auth.RequirePermission("payment.read")).Method(http.MethodGet, "/{id}/receipt.pdf", httpapi.Handler(h.receipt))
	})
}

func (h *Handlers) actor(r *http.Request) string { return auth.MustUser(r.Context()).ID }

func toI64(v any) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case float64:
		return int64(n)
	case int:
		return int64(n)
	}
	return 0
}

func shapeInvoice(r store.Row) store.Row {
	amount, paid := toI64(r["amount_minor"]), toI64(r["paid_minor"])
	return store.Row{
		"id": r["id"], "student_id": r["student_id"], "student_name": r["student_name"], "reg_no": r["reg_no"],
		"class_id": r["class_id"], "class_name": r["class_name"], "code": r["code"], "period": r["period"],
		"amount_minor": amount, "paid_minor": paid, "outstanding_minor": amount - paid,
		"due_date": r["due_date"], "status": r["status"], "waived_reason": r["waived_reason"], "created_at": r["created_at"],
	}
}

func (h *Handlers) getInvoiceShaped(ctx context.Context, id string) (store.Row, error) {
	row, err := store.QueryFirstMap(ctx, h.db, invoiceSelect+` WHERE i.id = ?`, id)
	if err != nil || row == nil {
		return nil, err
	}
	return shapeInvoice(row), nil
}

func (h *Handlers) listInvoices(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	where, args := []string{}, []any{}
	for param, col := range map[string]string{"period": "i.period", "status": "i.status", "student_id": "i.student_id", "class_id": "i.class_id"} {
		if v := q.Get(param); v != "" {
			where, args = append(where, col+" = ?"), append(args, v)
		}
	}
	whereSQL := ""
	if len(where) > 0 {
		whereSQL = " WHERE " + strings.Join(where, " AND ")
	}
	var total int64
	if err := h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM invoices i`+whereSQL, args...).Scan(&total); err != nil {
		return err
	}
	p := httpapi.ParsePage(r)
	rows, err := store.QueryMaps(r.Context(), h.db,
		invoiceSelect+whereSQL+" ORDER BY i.period DESC, s.name_normalized LIMIT ? OFFSET ?",
		append(args, p.Limit, p.Offset)...)
	if err != nil {
		return err
	}
	out := make([]store.Row, 0, len(rows))
	for _, row := range rows {
		out = append(out, shapeInvoice(row))
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"invoices": out, "total": total, "page": p.Page, "page_size": p.PageSize})
	return nil
}

func (h *Handlers) generate(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Period  string `json:"period"`
		DueDate string `json:"due_date"`
		ClassID string `json:"class_id"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if len(in.Period) != 7 || in.Period[4] != '-' {
		return httpapi.BadRequest("invalid_body")
	}
	created, err := GenerateInvoices(r.Context(), h.db, GenerateOpts{Period: in.Period, DueDate: in.DueDate, ClassID: in.ClassID})
	if err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "invoice.generate", EntityType: sp("invoice"), After: map[string]any{"period": in.Period, "created": created}})
	httpapi.JSON(w, http.StatusOK, map[string]any{"created": created})
	return nil
}

func (h *Handlers) patchInvoice(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	var status string
	if err := h.db.QueryRowContext(r.Context(), `SELECT status FROM invoices WHERE id = ?`, id).Scan(&status); err == sql.ErrNoRows {
		return httpapi.NotFound("not_found")
	} else if err != nil {
		return err
	}
	var in struct {
		AmountMinor  *int64  `json:"amount_minor"`
		DueDate      *string `json:"due_date"`
		Waive        bool    `json:"waive"`
		WaivedReason *string `json:"waived_reason"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	actor := h.actor(r)
	if in.Waive {
		if _, err := h.db.ExecContext(r.Context(), `UPDATE invoices SET status = 'waived', waived_reason = ?, updated_at = ? WHERE id = ?`, in.WaivedReason, cryptox.NowISO(), id); err != nil {
			return err
		}
		_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "invoice.waive", EntityType: sp("invoice"), EntityID: &id})
	} else {
		sets, args := []string{}, []any{}
		if in.AmountMinor != nil {
			sets, args = append(sets, "amount_minor = ?"), append(args, *in.AmountMinor)
		}
		if in.DueDate != nil {
			sets, args = append(sets, "due_date = ?"), append(args, *in.DueDate)
		}
		if len(sets) > 0 {
			sets = append(sets, "updated_at = ?")
			args = append(args, cryptox.NowISO())
			if _, err := h.db.ExecContext(r.Context(), `UPDATE invoices SET `+strings.Join(sets, ", ")+` WHERE id = ?`, append(args, id)...); err != nil {
				return err
			}
			if err := RecomputeInvoiceStatus(r.Context(), h.db, id); err != nil {
				return err
			}
			_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "invoice.update", EntityType: sp("invoice"), EntityID: &id})
		}
	}
	row, err := h.getInvoiceShaped(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func (h *Handlers) listPayments(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	where, args := []string{}, []any{}
	if v := q.Get("invoice_id"); v != "" {
		where, args = append(where, "invoice_id = ?"), append(args, v)
	}
	if v := q.Get("student_id"); v != "" {
		where, args = append(where, "student_id = ?"), append(args, v)
	}
	whereSQL := ""
	if len(where) > 0 {
		whereSQL = " WHERE " + strings.Join(where, " AND ")
	}
	var total int64
	if err := h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM payments`+whereSQL, args...).Scan(&total); err != nil {
		return err
	}
	p := httpapi.ParsePage(r)
	rows, err := store.QueryMaps(r.Context(), h.db,
		`SELECT id, invoice_id, student_id, amount_minor, method, receipt_no, note, paid_at FROM payments`+whereSQL+" ORDER BY paid_at DESC LIMIT ? OFFSET ?",
		append(args, p.Limit, p.Offset)...)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"payments": rows, "total": total, "page": p.Page, "page_size": p.PageSize})
	return nil
}

func (h *Handlers) createPayment(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		InvoiceID   string `json:"invoice_id"`
		AmountMinor int64  `json:"amount_minor"`
		Method      string `json:"method"`
		Note        string `json:"note"`
		PaidAt      string `json:"paid_at"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if in.InvoiceID == "" || in.AmountMinor <= 0 || in.Method == "" {
		return httpapi.BadRequest("invalid_body")
	}
	var studentID, status string
	err := h.db.QueryRowContext(r.Context(), `SELECT student_id, status FROM invoices WHERE id = ?`, in.InvoiceID).Scan(&studentID, &status)
	if err == sql.ErrNoRows {
		return httpapi.NotFound("invoice_not_found")
	}
	if err != nil {
		return err
	}
	if status == "waived" {
		return httpapi.BadRequest("invoice_waived")
	}
	paidAt := in.PaidAt
	if paidAt == "" {
		paidAt = cryptox.NowISO()
	}
	receiptNo, err := NextReceiptNo(r.Context(), h.db, paidAt)
	if err != nil {
		return err
	}
	id := cryptox.NewID("pay")
	var note *string
	if in.Note != "" {
		note = &in.Note
	}
	actor := h.actor(r)
	if _, err := h.db.ExecContext(r.Context(),
		`INSERT INTO payments (id, invoice_id, student_id, amount_minor, method, receipt_no, note, recorded_by, paid_at, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.InvoiceID, studentID, in.AmountMinor, in.Method, receiptNo, note, actor, paidAt, cryptox.NowISO()); err != nil {
		return err
	}
	if err := RecomputeInvoiceStatus(r.Context(), h.db, in.InvoiceID); err != nil {
		return err
	}
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "payment.record", EntityType: sp("payment"), EntityID: &id, After: map[string]any{"invoice_id": in.InvoiceID, "amount_minor": in.AmountMinor, "receipt_no": receiptNo}})

	payment, err := store.QueryFirstMap(r.Context(), h.db, `SELECT id, invoice_id, student_id, amount_minor, method, receipt_no, note, paid_at FROM payments WHERE id = ?`, id)
	if err != nil {
		return err
	}
	invoice, err := h.getInvoiceShaped(r.Context(), in.InvoiceID)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusCreated, map[string]any{"payment": payment, "invoice": invoice})
	return nil
}

func (h *Handlers) receipt(w http.ResponseWriter, r *http.Request) error {
	row, err := store.QueryFirstMap(r.Context(), h.db,
		`SELECT p.receipt_no, p.amount_minor, p.method, p.paid_at, s.full_name, s.reg_no, c.name AS class_name, i.period
		   FROM payments p
		   JOIN invoices i ON i.id = p.invoice_id
		   JOIN students s ON s.id = p.student_id
		   JOIN classes c ON c.id = i.class_id
		  WHERE p.id = ?`, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	if row == nil {
		return httpapi.NotFound("not_found")
	}
	org := "attendly"
	if err := h.db.QueryRowContext(r.Context(), `SELECT value FROM settings WHERE key = 'org_name'`).Scan(&org); err != nil && err != sql.ErrNoRows {
		return err
	}
	str := func(k string) string {
		if v, ok := row[k].(string); ok {
			return v
		}
		return ""
	}
	pdf, err := pdfgen.Receipt(pdfgen.ReceiptData{
		OrgName: org, ReceiptNo: str("receipt_no"), PaidAt: str("paid_at"),
		StudentName: str("full_name"), RegNo: str("reg_no"), ClassName: str("class_name"),
		Period: str("period"), Method: str("method"),
		AmountText: fmt.Sprintf("%.2f", float64(toI64(row["amount_minor"]))/100),
	})
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="receipt-%s.pdf"`, str("receipt_no")))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdf)
	return nil
}

func sp(s string) *string { return &s }
