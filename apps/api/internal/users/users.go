// Package users serves user management (user.read / user.manage), including
// role assignment and the last-owner / self-action safety rules.
package users

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/auth"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/store"
)

type roleSummary struct {
	ID    string `json:"id"`
	Key   string `json:"key"`
	Label string `json:"label"`
}

// Handlers serves the users domain.
type Handlers struct{ db *sql.DB }

// New constructs the users handlers.
func New(db *sql.DB) *Handlers { return &Handlers{db: db} }

// Mount registers /api/users (Authenticate applied upstream).
func (h *Handlers) Mount(r chi.Router) {
	read := auth.RequirePermission("user.read")
	manage := auth.RequirePermission("user.manage")
	r.Route("/api/users", func(r chi.Router) {
		r.With(read).Method(http.MethodGet, "/", httpapi.Handler(h.list))
		r.With(manage).Method(http.MethodPost, "/", httpapi.Handler(h.create))
		r.With(read).Method(http.MethodGet, "/{id}", httpapi.Handler(h.get))
		r.With(manage).Method(http.MethodPatch, "/{id}", httpapi.Handler(h.update))
		r.With(manage).Method(http.MethodDelete, "/{id}", httpapi.Handler(h.remove))
	})
}

func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	return strings.TrimSuffix(strings.Repeat("?, ", n), ", ")
}

func toAny(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}

func (h *Handlers) rolesByUser(ctx context.Context, userIDs []string) (map[string][]roleSummary, error) {
	out := map[string][]roleSummary{}
	if len(userIDs) == 0 {
		return out, nil
	}
	rows, err := h.db.QueryContext(ctx,
		`SELECT ur.user_id, r.id, r.key, r.label FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		  WHERE ur.user_id IN (`+placeholders(len(userIDs))+`) ORDER BY r.label`, toAny(userIDs)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		var rs roleSummary
		if err := rows.Scan(&uid, &rs.ID, &rs.Key, &rs.Label); err != nil {
			return nil, err
		}
		out[uid] = append(out[uid], rs)
	}
	return out, rows.Err()
}

func (h *Handlers) activeOwnerIDs(ctx context.Context) (map[string]bool, error) {
	rows, err := h.db.QueryContext(ctx,
		`SELECT u.id FROM users u
		   JOIN user_roles ur ON ur.user_id = u.id
		   JOIN roles r ON r.id = ur.role_id
		  WHERE r.key = 'owner' AND u.status = 'active' AND u.deleted_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

func (h *Handlers) resolveRoles(ctx context.Context, roleIDs []string) error {
	if len(roleIDs) == 0 {
		return nil
	}
	rows, err := h.db.QueryContext(ctx, `SELECT id FROM roles WHERE id IN (`+placeholders(len(roleIDs))+`)`, toAny(roleIDs)...)
	if err != nil {
		return err
	}
	defer rows.Close()
	found := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		found[id] = true
	}
	for _, id := range roleIDs {
		if !found[id] {
			return httpapi.ErrWithDetails(http.StatusUnprocessableEntity, "unknown_role", map[string]any{"role_id": id})
		}
	}
	return nil
}

func (h *Handlers) roleIDsIncludeOwner(ctx context.Context, roleIDs []string) (bool, error) {
	if len(roleIDs) == 0 {
		return false, nil
	}
	var x int
	err := h.db.QueryRowContext(ctx, `SELECT 1 FROM roles WHERE key = 'owner' AND id IN (`+placeholders(len(roleIDs))+`) LIMIT 1`, toAny(roleIDs)...).Scan(&x)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func (h *Handlers) userRow(ctx context.Context, id string, includeDeleted bool) (store.Row, error) {
	q := `SELECT id, email, name, status, created_at, last_login_at FROM users WHERE id = ?`
	if !includeDeleted {
		q += ` AND deleted_at IS NULL`
	}
	return store.QueryFirstMap(ctx, h.db, q, id)
}

func (h *Handlers) withRoles(ctx context.Context, u store.Row) (store.Row, error) {
	id, _ := u["id"].(string)
	roles, err := h.rolesByUser(ctx, []string{id})
	if err != nil {
		return nil, err
	}
	rs := roles[id]
	if rs == nil {
		rs = []roleSummary{}
	}
	u["roles"] = rs
	return u, nil
}

func (h *Handlers) actor(r *http.Request) string { return auth.MustUser(r.Context()).ID }

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	rows, err := store.QueryMaps(r.Context(), h.db, `SELECT id, email, name, status, created_at, last_login_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC`)
	if err != nil {
		return err
	}
	ids := make([]string, 0, len(rows))
	for _, u := range rows {
		if id, ok := u["id"].(string); ok {
			ids = append(ids, id)
		}
	}
	roles, err := h.rolesByUser(r.Context(), ids)
	if err != nil {
		return err
	}
	for _, u := range rows {
		id, _ := u["id"].(string)
		rs := roles[id]
		if rs == nil {
			rs = []roleSummary{}
		}
		u["roles"] = rs
	}
	httpapi.JSON(w, http.StatusOK, map[string]any{"users": rows})
	return nil
}

func (h *Handlers) create(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string   `json:"email"`
		Name     string   `json:"name"`
		Password string   `json:"password"`
		RoleIDs  []string `json:"role_ids"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Name = strings.TrimSpace(in.Name)
	if in.Email == "" || in.Name == "" || len(in.Password) < 8 {
		return httpapi.BadRequest("invalid_body")
	}
	if err := h.resolveRoles(r.Context(), in.RoleIDs); err != nil {
		return err
	}
	var existing string
	if err := h.db.QueryRowContext(r.Context(), `SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`, in.Email).Scan(&existing); err == nil {
		return httpapi.Conflict("email_taken")
	} else if err != sql.ErrNoRows {
		return err
	}

	id := cryptox.NewID("usr")
	now := cryptox.NowISO()
	hash, err := cryptox.HashPassword(in.Password)
	if err != nil {
		return err
	}
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`, id, in.Email, in.Name, hash, now, now); err != nil {
		return err
	}
	for _, rid := range in.RoleIDs {
		if _, err := tx.ExecContext(r.Context(), `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, id, rid); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "user.create", EntityType: sp("user"), EntityID: &id, After: map[string]any{"email": in.Email, "name": in.Name, "role_ids": in.RoleIDs}})
	row, err := h.userRow(r.Context(), id, false)
	if err != nil {
		return err
	}
	row, err = h.withRoles(r.Context(), row)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusCreated, row)
	return nil
}

func (h *Handlers) get(w http.ResponseWriter, r *http.Request) error {
	row, err := h.userRow(r.Context(), chi.URLParam(r, "id"), false)
	if err != nil {
		return err
	}
	if row == nil {
		return httpapi.NotFound("not_found")
	}
	row, err = h.withRoles(r.Context(), row)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func (h *Handlers) update(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	actorID := h.actor(r)
	var status string
	if err := h.db.QueryRowContext(r.Context(), `SELECT status FROM users WHERE id = ? AND deleted_at IS NULL`, id).Scan(&status); err == sql.ErrNoRows {
		return httpapi.NotFound("not_found")
	} else if err != nil {
		return err
	}

	var in struct {
		Name    *string   `json:"name"`
		Status  *string   `json:"status"`
		RoleIDs *[]string `json:"role_ids"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if in.RoleIDs != nil {
		if err := h.resolveRoles(r.Context(), *in.RoleIDs); err != nil {
			return err
		}
	}

	owners, err := h.activeOwnerIDs(r.Context())
	if err != nil {
		return err
	}
	willSuspend := in.Status != nil && *in.Status == "suspended"
	willRemoveOwner := false
	if in.RoleIDs != nil && owners[id] {
		inc, err := h.roleIDsIncludeOwner(r.Context(), *in.RoleIDs)
		if err != nil {
			return err
		}
		willRemoveOwner = !inc
	}
	if owners[id] && (willSuspend || willRemoveOwner) && len(owners) <= 1 {
		return httpapi.BadRequest("last_owner")
	}
	if willSuspend && id == actorID {
		return httpapi.BadRequest("cannot_suspend_self")
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	sets, args := []string{}, []any{}
	if in.Name != nil {
		sets, args = append(sets, "name = ?"), append(args, *in.Name)
	}
	if in.Status != nil {
		sets, args = append(sets, "status = ?"), append(args, *in.Status)
	}
	sets = append(sets, "updated_at = ?")
	args = append(args, cryptox.NowISO())
	if _, err := tx.ExecContext(r.Context(), `UPDATE users SET `+strings.Join(sets, ", ")+` WHERE id = ?`, append(args, id)...); err != nil {
		return err
	}
	if in.RoleIDs != nil {
		if _, err := tx.ExecContext(r.Context(), `DELETE FROM user_roles WHERE user_id = ?`, id); err != nil {
			return err
		}
		for _, rid := range *in.RoleIDs {
			if _, err := tx.ExecContext(r.Context(), `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, id, rid); err != nil {
				return err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actorID, Action: "user.update", EntityType: sp("user"), EntityID: &id})
	row, err := h.userRow(r.Context(), id, true)
	if err != nil {
		return err
	}
	row, err = h.withRoles(r.Context(), row)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, row)
	return nil
}

func (h *Handlers) remove(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	actorID := h.actor(r)
	if id == actorID {
		return httpapi.BadRequest("cannot_delete_self")
	}
	var x string
	if err := h.db.QueryRowContext(r.Context(), `SELECT id FROM users WHERE id = ? AND deleted_at IS NULL`, id).Scan(&x); err == sql.ErrNoRows {
		return httpapi.NotFound("not_found")
	} else if err != nil {
		return err
	}
	owners, err := h.activeOwnerIDs(r.Context())
	if err != nil {
		return err
	}
	if owners[id] && len(owners) <= 1 {
		return httpapi.BadRequest("last_owner")
	}
	now := cryptox.NowISO()
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, stmt := range []struct {
		q    string
		args []any
	}{
		{`UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ?`, []any{now, now, id}},
		{`DELETE FROM user_roles WHERE user_id = ?`, []any{id}},
		{`UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, []any{now, id}},
	} {
		if _, err := tx.ExecContext(r.Context(), stmt.q, stmt.args...); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actorID, Action: "user.delete", EntityType: sp("user"), EntityID: &id})
	httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func sp(s string) *string { return &s }
