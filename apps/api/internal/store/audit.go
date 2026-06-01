package store

import (
	"context"
	"database/sql"
	"encoding/json"

	"attendly/api/internal/cryptox"
)

// Execer is the subset of *sql.DB / *sql.Tx needed to write a row, so audit
// entries can be recorded inside or outside a transaction.
type Execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// AuditEntry is one append-only audit-log record (SRS §9).
type AuditEntry struct {
	ActorID    *string
	Action     string
	EntityType *string
	EntityID   *string
	Before     any
	After      any
}

// WriteAudit appends an audit-log row. The audit log is never updated/deleted.
func WriteAudit(ctx context.Context, ex Execer, e AuditEntry) error {
	var before, after *string
	if e.Before != nil {
		if b, err := json.Marshal(e.Before); err == nil {
			s := string(b)
			before = &s
		}
	}
	if e.After != nil {
		if b, err := json.Marshal(e.After); err == nil {
			s := string(b)
			after = &s
		}
	}
	_, err := ex.ExecContext(ctx,
		`INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, before_json, after_json, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		cryptox.NewID("aud"), e.ActorID, e.Action, e.EntityType, e.EntityID, before, after, cryptox.NowISO(),
	)
	return err
}
