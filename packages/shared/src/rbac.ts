/**
 * RBAC evaluation — shared by the API (authoritative) and the admin portal
 * (cosmetic UI gating only). The server check is the source of truth (SRS §7.1).
 */

import { ALL_PERMISSIONS } from "./permissions";

/**
 * Does a set of granted permissions satisfy a required permission?
 *
 * Supports two wildcard forms:
 *   - `*`            → grants everything (owner)
 *   - `resource.*`   → grants every action on that resource
 *
 * @param granted  The permission keys the actor holds (from their roles).
 * @param required The permission key the route/UI requires.
 */
export function hasPermission(
  granted: Iterable<string>,
  required: string,
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  if (set.has(ALL_PERMISSIONS)) return true;
  if (set.has(required)) return true;

  const dot = required.indexOf(".");
  if (dot > 0) {
    const resource = required.slice(0, dot);
    if (set.has(`${resource}.*`)) return true;
  }
  return false;
}

/** True if the actor satisfies every required permission. */
export function hasAllPermissions(
  granted: Iterable<string>,
  required: Iterable<string>,
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  for (const r of required) {
    if (!hasPermission(set, r)) return false;
  }
  return true;
}

/** True if the actor satisfies at least one of the required permissions. */
export function hasAnyPermission(
  granted: Iterable<string>,
  required: Iterable<string>,
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  for (const r of required) {
    if (hasPermission(set, r)) return true;
  }
  return false;
}
