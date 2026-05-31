// Package migrations embeds the SQL schema migrations so the server can apply
// them on boot without shipping loose files alongside the binary.
package migrations

import "embed"

// FS holds the ordered *.sql migration files (D1/SQLite-compatible).
//
//go:embed *.sql
var FS embed.FS
