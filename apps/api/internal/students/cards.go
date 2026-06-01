package students

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/pdfgen"
	"attendly/api/internal/store"
)

func mstr(row store.Row, k string) string {
	if v, ok := row[k].(string); ok {
		return v
	}
	return ""
}

func (h *Handlers) issueCard(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if err := h.requireStudent(r.Context(), id); err != nil {
		return err
	}
	now := cryptox.NowISO()
	if _, err := h.db.ExecContext(r.Context(),
		`UPDATE students SET card_token = ?, card_status = 'active', card_issued_at = ?, updated_at = ? WHERE id = ?`,
		cryptox.RandomToken(16), now, now, id); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "card.issue", EntityType: sp("student"), EntityID: &id})
	row, err := h.detail(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func (h *Handlers) revokeCard(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if err := h.requireStudent(r.Context(), id); err != nil {
		return err
	}
	status := "revoked"
	var body struct {
		Status string `json:"status"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body) // empty body is fine
	if body.Status == "lost" {
		status = "lost"
	}
	if _, err := h.db.ExecContext(r.Context(), `UPDATE students SET card_status = ?, updated_at = ? WHERE id = ?`, status, cryptox.NowISO(), id); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "card.revoke", EntityType: sp("student"), EntityID: &id, After: map[string]any{"card_status": status}})
	row, err := h.detail(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func (h *Handlers) cardPDF(w http.ResponseWriter, r *http.Request) error {
	row, err := h.getStudent(r.Context(), chi.URLParam(r, "id"))
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
	if org == "" {
		org = "attendly"
	}

	status := mstr(row, "status")
	subtitle := status
	if status == "active" {
		if createdAt := mstr(row, "created_at"); len(createdAt) >= 4 {
			subtitle = "Batch " + createdAt[:4]
		}
	}

	pdf, err := pdfgen.Card(pdfgen.CardData{
		OrgName:   org,
		FullName:  mstr(row, "full_name"),
		RegNo:     mstr(row, "reg_no"),
		Subtitle:  subtitle,
		CardToken: mstr(row, "card_token"),
		Active:    mstr(row, "card_status") == "active",
	})
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="card-%s.pdf"`, mstr(row, "reg_no")))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdf)
	return nil
}
