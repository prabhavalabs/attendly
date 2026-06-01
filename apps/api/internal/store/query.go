package store

import (
	"context"
	"database/sql"
)

// Queryer is the read subset of *sql.DB / *sql.Tx.
type Queryer interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// Row is a single result row keyed by column name. JSON-encodes the way the
// previous API's responses did (numbers stay numbers, text stays text).
type Row = map[string]any

// QueryMaps runs a query and returns every row as a column→value map. Suited to
// read endpoints whose response is "shape of the SQL projection" rather than a
// fixed struct. Mutations should use typed code instead.
func QueryMaps(ctx context.Context, q Queryer, query string, args ...any) ([]Row, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	out := make([]Row, 0, 16)
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := make(Row, len(cols))
		for i, c := range cols {
			m[c] = normalize(vals[i])
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// QueryFirstMap returns the first row, or nil if there are none.
func QueryFirstMap(ctx context.Context, q Queryer, query string, args ...any) (Row, error) {
	rows, err := QueryMaps(ctx, q, query, args...)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}

// normalize converts driver byte slices to strings; other scalars pass through.
func normalize(v any) any {
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	return v
}
