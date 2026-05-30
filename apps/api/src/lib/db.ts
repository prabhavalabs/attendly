/**
 * D1 Sessions-API helpers (SRS §3.2, §6.1).
 *
 * Clients echo the `x-d1-bookmark` response header on their next request so the
 * Sessions API serves sequentially-consistent reads across replicas. Reads go to
 * the nearest replica; writes are routed to the primary automatically.
 */
import type { Env, Db, AuthUser } from "../types";
import { newId, nowIso } from "./id";

export const D1_BOOKMARK_HEADER = "x-d1-bookmark";

/** Create a session constrained by the client's bookmark (if any). */
export function openSession(env: Env, bookmark: string | null): Db {
  return env.DB.withSession(bookmark ?? "first-unconstrained");
}

/** Append an audit-log row. The audit log is append-only (SRS §9). */
export async function writeAudit(
  db: Db,
  entry: {
    actorId: string | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, before_json, after_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId("aud"),
      entry.actorId,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      nowIso(),
    )
    .run();
}

/**
 * Load a user with their roles and flattened permission set.
 * Returns null if the user does not exist or is soft-deleted.
 */
export async function loadAuthUser(db: Db, userId: string): Promise<AuthUser | null> {
  const user = await db
    .prepare(
      `SELECT id, email, name, status FROM users WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(userId)
    .first<{ id: string; email: string; name: string; status: "active" | "suspended" }>();
  if (!user) return null;

  const rolesRes = await db
    .prepare(
      `SELECT r.id, r.key, r.label
         FROM roles r
         JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = ?
        ORDER BY r.label`,
    )
    .bind(userId)
    .all<{ id: string; key: string; label: string }>();

  const permsRes = await db
    .prepare(
      `SELECT DISTINCT rp.permission_key AS k
         FROM role_permissions rp
         JOIN user_roles ur ON ur.role_id = rp.role_id
        WHERE ur.user_id = ?`,
    )
    .bind(userId)
    .all<{ k: string }>();

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    roles: rolesRes.results ?? [],
    permissions: new Set((permsRes.results ?? []).map((r) => r.k)),
  };
}
