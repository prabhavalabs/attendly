/** Text helpers shared across modules. */

/**
 * Normalize a name for search: NFD-decompose, strip diacritics, lowercase, trim,
 * collapse internal whitespace. Stored as `name_normalized` (SRS §5.5).
 */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Escape a user string for a SQL LIKE pattern (escapes %, _ and the \ escape char). */
export function likeEscape(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
