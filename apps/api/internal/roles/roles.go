// Package roles serves role management + the permission catalog
// (user.read / user.manage).
package roles

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"attendly/api/internal/auth"
	"attendly/api/internal/cryptox"
	"attendly/api/internal/httpapi"
	"attendly/api/internal/rbac"
	"attendly/api/internal/store"
)

// Handlers serves the roles + permissions endpoints.
type Handlers struct{ db *sql.DB }

// New constructs the roles handlers.
func New(db *sql.DB) *Handlers { return &Handlers{db: db} }

// Mount registers /api/roles and /api/permissions (Authenticate upstream).
func (h *Handlers) Mount(r chi.Router) {
	read := auth.RequirePermission("user.read")
	manage := auth.RequirePermission("user.manage")
	r.Route("/api/roles", func(r chi.Router) {
		r.With(read).Method(http.MethodGet, "/", httpapi.Handler(h.list))
		r.With(manage).Method(http.MethodPost, "/", httpapi.Handler(h.create))
		r.With(manage).Method(http.MethodPatch, "/{id}", httpapi.Handler(h.update))
		r.With(manage).Method(http.MethodDelete, "/{id}", httpapi.Handler(h.remove))
	})
	r.With(read).Method(http.MethodGet, "/api/permissions", httpapi.Handler(h.permissions))
}

func (h *Handlers) actor(r *http.Request) string { return auth.MustUser(r.Context()).ID }

func validatePermissions(perms []string) error {
	for _, p := range perms {
		if !rbac.IsValidPermissionKey(p) {
			return httpapi.ErrWithDetails(http.StatusUnprocessableEntity, "unknown_permission", map[string]any{"permission": p})
		}
	}
	return nil
}

type roleDetail struct {
	ID          string   `json:"id"`
	Key         string   `json:"key"`
	Label       string   `json:"label"`
	Description string   `json:"description"`
	System      bool     `json:"system"`
	Permissions []string `json:"permissions"`
}

func (h *Handlers) loadRole(ctx context.Context, id string) (*roleDetail, error) {
	var rd roleDetail
	var system int
	err := h.db.QueryRowContext(ctx, `SELECT id, key, label, description, system FROM roles WHERE id = ?`, id).
		Scan(&rd.ID, &rd.Key, &rd.Label, &rd.Description, &system)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rd.System = system == 1
	rd.Permissions = []string{}
	rows, err := h.db.QueryContext(ctx, `SELECT permission_key FROM role_permissions WHERE role_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		rd.Permissions = append(rd.Permissions, p)
	}
	return &rd, rows.Err()
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	roleRows, err := h.db.QueryContext(r.Context(), `SELECT id, key, label, description, system FROM roles ORDER BY system DESC, label`)
	if err != nil {
		return err
	}
	type roleView struct {
		roleDetail
		UserCount int64 `json:"user_count"`
	}
	roleList := []*roleView{}
	byID := map[string]*roleView{}
	for roleRows.Next() {
		var rv roleView
		var system int
		if err := roleRows.Scan(&rv.ID, &rv.Key, &rv.Label, &rv.Description, &system); err != nil {
			roleRows.Close()
			return err
		}
		rv.System = system == 1
		rv.Permissions = []string{}
		roleList = append(roleList, &rv)
		byID[rv.ID] = &rv
	}
	roleRows.Close()
	if err := roleRows.Err(); err != nil {
		return err
	}

	permRows, err := h.db.QueryContext(r.Context(), `SELECT role_id, permission_key FROM role_permissions`)
	if err != nil {
		return err
	}
	for permRows.Next() {
		var rid, pk string
		if err := permRows.Scan(&rid, &pk); err != nil {
			permRows.Close()
			return err
		}
		if rv := byID[rid]; rv != nil {
			rv.Permissions = append(rv.Permissions, pk)
		}
	}
	permRows.Close()

	countRows, err := h.db.QueryContext(r.Context(), `SELECT role_id, COUNT(*) FROM user_roles GROUP BY role_id`)
	if err != nil {
		return err
	}
	for countRows.Next() {
		var rid string
		var n int64
		if err := countRows.Scan(&rid, &n); err != nil {
			countRows.Close()
			return err
		}
		if rv := byID[rid]; rv != nil {
			rv.UserCount = n
		}
	}
	countRows.Close()

	httpapi.JSON(w, http.StatusOK, map[string]any{"roles": roleList})
	return nil
}

func (h *Handlers) create(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Key         string   `json:"key"`
		Label       string   `json:"label"`
		Description string   `json:"description"`
		Permissions []string `json:"permissions"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	in.Key, in.Label = strings.TrimSpace(in.Key), strings.TrimSpace(in.Label)
	if in.Key == "" || in.Label == "" {
		return httpapi.BadRequest("invalid_body")
	}
	if err := validatePermissions(in.Permissions); err != nil {
		return err
	}
	var clash string
	if err := h.db.QueryRowContext(r.Context(), `SELECT id FROM roles WHERE key = ?`, in.Key).Scan(&clash); err == nil {
		return httpapi.Conflict("role_key_taken")
	} else if err != sql.ErrNoRows {
		return err
	}

	id := cryptox.NewID("rol")
	now := cryptox.NowISO()
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO roles (id, key, label, description, system, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`, id, in.Key, in.Label, in.Description, now, now); err != nil {
		return err
	}
	for _, p := range in.Permissions {
		if _, err := tx.ExecContext(r.Context(), `INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)`, id, p); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "role.create", EntityType: sp("role"), EntityID: &id})
	rd, err := h.loadRole(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusCreated, rd)
	return nil
}

func (h *Handlers) update(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	role, err := h.loadRole(r.Context(), id)
	if err != nil {
		return err
	}
	if role == nil {
		return httpapi.NotFound("not_found")
	}
	var in struct {
		Label       *string   `json:"label"`
		Description *string   `json:"description"`
		Permissions *[]string `json:"permissions"`
	}
	if err := httpapi.Decode(r, &in); err != nil {
		return err
	}
	if role.Key == "owner" && in.Permissions != nil {
		return httpapi.BadRequest("owner_permissions_locked")
	}
	if in.Permissions != nil {
		if err := validatePermissions(*in.Permissions); err != nil {
			return err
		}
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	sets, args := []string{}, []any{}
	if in.Label != nil {
		sets, args = append(sets, "label = ?"), append(args, *in.Label)
	}
	if in.Description != nil {
		sets, args = append(sets, "description = ?"), append(args, *in.Description)
	}
	if len(sets) > 0 {
		sets = append(sets, "updated_at = ?")
		args = append(args, cryptox.NowISO())
		if _, err := tx.ExecContext(r.Context(), `UPDATE roles SET `+strings.Join(sets, ", ")+` WHERE id = ?`, append(args, id)...); err != nil {
			return err
		}
	}
	if in.Permissions != nil {
		if _, err := tx.ExecContext(r.Context(), `DELETE FROM role_permissions WHERE role_id = ?`, id); err != nil {
			return err
		}
		for _, p := range *in.Permissions {
			if _, err := tx.ExecContext(r.Context(), `INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)`, id, p); err != nil {
				return err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "role.update", EntityType: sp("role"), EntityID: &id})
	rd, err := h.loadRole(r.Context(), id)
	if err != nil {
		return err
	}
	httpapi.JSON(w, http.StatusOK, rd)
	return nil
}

func (h *Handlers) remove(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	role, err := h.loadRole(r.Context(), id)
	if err != nil {
		return err
	}
	if role == nil {
		return httpapi.NotFound("not_found")
	}
	if role.System {
		return httpapi.BadRequest("cannot_delete_system_role")
	}
	var inUse int64
	if err := h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM user_roles WHERE role_id = ?`, id).Scan(&inUse); err != nil {
		return err
	}
	if inUse > 0 {
		return httpapi.Conflict("role_in_use")
	}
	if _, err := h.db.ExecContext(r.Context(), `DELETE FROM roles WHERE id = ?`, id); err != nil {
		return err
	}
	actor := h.actor(r)
	_ = store.WriteAudit(r.Context(), h.db, store.AuditEntry{ActorID: &actor, Action: "role.delete", EntityType: sp("role"), EntityID: &id})
	httpapi.JSON(w, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func (h *Handlers) permissions(w http.ResponseWriter, _ *http.Request) error {
	httpapi.JSON(w, http.StatusOK, map[string]any{"groups": rbac.PermissionGroups()})
	return nil
}

func sp(s string) *string { return &s }
