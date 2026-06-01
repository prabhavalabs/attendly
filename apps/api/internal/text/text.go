// Package text holds small string helpers shared across domains.
package text

import (
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

var diacriticStripper = transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)

// NormalizeName lowercases, strips diacritics, trims, and collapses whitespace
// for search (stored as students.name_normalized).
func NormalizeName(input string) string {
	out, _, err := transform.String(diacriticStripper, input)
	if err != nil {
		out = input
	}
	out = strings.ToLower(strings.TrimSpace(out))
	return strings.Join(strings.Fields(out), " ")
}

// LikeEscape escapes %, _ and the backslash escape char for SQL LIKE patterns.
func LikeEscape(input string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(input)
}
