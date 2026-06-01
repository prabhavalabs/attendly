package rbac

import (
	"context"
	"database/sql"
	"fmt"

	"attendly/api/internal/cryptox"
)

// Seed idempotently inserts the permission catalog and the default system
// roles (with their permission grants), reusing existing role ids where
// present. It returns a map of role key → role id.
func Seed(ctx context.Context, db *sql.DB) (map[string]string, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	for _, p := range Permissions {
		if _, err := tx.ExecContext(ctx,
			`INSERT OR IGNORE INTO permissions (key, resource, action, label) VALUES (?, ?, ?, ?)`,
			p.Key, p.Resource, p.Action, p.Label,
		); err != nil {
			return nil, fmt.Errorf("seed permission %s: %w", p.Key, err)
		}
	}

	idByKey := make(map[string]string)
	rows, err := tx.QueryContext(ctx, `SELECT id, key FROM roles`)
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	for rows.Next() {
		var id, key string
		if err := rows.Scan(&id, &key); err != nil {
			_ = rows.Close()
			return nil, err
		}
		idByKey[key] = id
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	_ = rows.Close()

	now := cryptox.NowISO()
	for _, role := range DefaultRoles {
		id, ok := idByKey[role.Key]
		if !ok {
			id = cryptox.NewID("rol")
			idByKey[role.Key] = id
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO roles (id, key, label, description, system, created_at, updated_at)
				 VALUES (?, ?, ?, ?, 1, ?, ?)`,
				id, role.Key, role.Label, role.Description, now, now,
			); err != nil {
				return nil, fmt.Errorf("seed role %s: %w", role.Key, err)
			}
		}
		for _, pk := range role.Permissions {
			if _, err := tx.ExecContext(ctx,
				`INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)`,
				id, pk,
			); err != nil {
				return nil, fmt.Errorf("grant %s to %s: %w", pk, role.Key, err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit seed: %w", err)
	}
	return idByKey, nil
}
