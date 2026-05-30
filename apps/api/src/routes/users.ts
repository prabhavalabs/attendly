/** User management routes (SRS §6.7, FR-1.3). Guarded by user.read / user.manage. */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createUserSchema, updateUserSchema } from "@tuition/shared";
import type { AppContext, Db } from "../types";
import { parseBody } from "../lib/validate";
import { hashPassword } from "../lib/crypto";
import { newId, nowIso } from "../lib/id";
import { writeAudit } from "../lib/db";
import { authenticate, requirePermission } from "../middleware/auth";

type RoleSummary = { id: string; key: string; label: string };

/** Group role summaries by user id for a set of users. */
async function rolesByUser(db: Db, userIds: string[]): Promise<Map<string, RoleSummary[]>> {
  const map = new Map<string, RoleSummary[]>();
  if (userIds.length === 0) return map;
  const placeholders = userIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT ur.user_id AS uid, r.id, r.key, r.label
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id IN (${placeholders})
        ORDER BY r.label`,
    )
    .bind(...userIds)
    .all<{ uid: string; id: string; key: string; label: string }>();
  for (const row of rows.results ?? []) {
    const list = map.get(row.uid) ?? [];
    list.push({ id: row.id, key: row.key, label: row.label });
    map.set(row.uid, list);
  }
  return map;
}

/** Ids of active, non-deleted users holding the owner role. */
async function activeOwnerIds(db: Db): Promise<Set<string>> {
  const rows = await db
    .prepare(
      `SELECT u.id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE r.key = 'owner' AND u.status = 'active' AND u.deleted_at IS NULL`,
    )
    .all<{ id: string }>();
  return new Set((rows.results ?? []).map((r) => r.id));
}

/** Validate that all given role ids exist; return their key map. */
async function resolveRoles(db: Db, roleIds: string[]): Promise<Map<string, string>> {
  const placeholders = roleIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT id, key FROM roles WHERE id IN (${placeholders})`)
    .bind(...roleIds)
    .all<{ id: string; key: string }>();
  const found = new Map((rows.results ?? []).map((r) => [r.id, r.key] as const));
  for (const id of roleIds) {
    if (!found.has(id)) throw new HTTPException(422, { message: "unknown_role", cause: { role_id: id } });
  }
  return found;
}

export const usersRoutes = new Hono<AppContext>();
usersRoutes.use("*", authenticate);

/** GET /api/users — list users with their roles. */
usersRoutes.get("/", requirePermission("user.read"), async (c) => {
  const db = c.get("db");
  const users = await db
    .prepare(
      `SELECT id, email, name, status, created_at, last_login_at
         FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC`,
    )
    .all<{ id: string; email: string; name: string; status: string; created_at: string; last_login_at: string | null }>();
  const rows = users.results ?? [];
  const roles = await rolesByUser(db, rows.map((u) => u.id));
  return c.json({ users: rows.map((u) => ({ ...u, roles: roles.get(u.id) ?? [] })) });
});

/** POST /api/users — create a user and assign roles. */
usersRoutes.post("/", requirePermission("user.manage"), async (c) => {
  const body = await parseBody(c, createUserSchema);
  const db = c.get("db");
  await resolveRoles(db, body.role_ids);

  const existing = await db
    .prepare(`SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`)
    .bind(body.email)
    .first<{ id: string }>();
  if (existing) throw new HTTPException(409, { message: "email_taken" });

  const id = newId("usr");
  const now = nowIso();
  const passwordHash = await hashPassword(body.password);
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      )
      .bind(id, body.email, body.name, passwordHash, now, now),
    ...body.role_ids.map((rid) =>
      db.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`).bind(id, rid),
    ),
  ]);
  await writeAudit(db, {
    actorId: c.get("user").id,
    action: "user.create",
    entityType: "user",
    entityId: id,
    after: { email: body.email, name: body.name, role_ids: body.role_ids },
  });

  const roles = await rolesByUser(db, [id]);
  return c.json({ id, email: body.email, name: body.name, status: "active", roles: roles.get(id) ?? [], created_at: now, last_login_at: null }, 201);
});

/** GET /api/users/:id — user detail. */
usersRoutes.get("/:id", requirePermission("user.read"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const user = await db
    .prepare(
      `SELECT id, email, name, status, created_at, last_login_at
         FROM users WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(id)
    .first<{ id: string; email: string; name: string; status: string; created_at: string; last_login_at: string | null }>();
  if (!user) throw new HTTPException(404, { message: "not_found" });
  const roles = await rolesByUser(db, [id]);
  return c.json({ ...user, roles: roles.get(id) ?? [] });
});

/** PATCH /api/users/:id — update name, status and/or role assignment. */
usersRoutes.patch("/:id", requirePermission("user.manage"), async (c) => {
  const body = await parseBody(c, updateUserSchema);
  const db = c.get("db");
  const id = c.req.param("id");
  const actorId = c.get("user").id;

  const target = await db
    .prepare(`SELECT id, status FROM users WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<{ id: string; status: string }>();
  if (!target) throw new HTTPException(404, { message: "not_found" });

  if (body.role_ids) await resolveRoles(db, body.role_ids);

  // Safety: keep at least one active owner, and block self-suspension.
  const owners = await activeOwnerIds(db);
  const willSuspend = body.status === "suspended";
  const willRemoveOwnerRole =
    body.role_ids !== undefined &&
    owners.has(id) &&
    !(await roleIdsIncludeOwner(db, body.role_ids));

  if (owners.has(id) && (willSuspend || willRemoveOwnerRole) && owners.size <= 1) {
    throw new HTTPException(400, { message: "last_owner" });
  }
  if (willSuspend && id === actorId) {
    throw new HTTPException(400, { message: "cannot_suspend_self" });
  }

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.name !== undefined) { sets.push("name = ?"); binds.push(body.name); }
  if (body.status !== undefined) { sets.push("status = ?"); binds.push(body.status); }
  sets.push("updated_at = ?"); binds.push(nowIso());

  const stmts: D1PreparedStatement[] = [
    db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id),
  ];
  if (body.role_ids) {
    stmts.push(db.prepare(`DELETE FROM user_roles WHERE user_id = ?`).bind(id));
    for (const rid of body.role_ids) {
      stmts.push(db.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`).bind(id, rid));
    }
  }
  await db.batch(stmts);
  await writeAudit(db, { actorId, action: "user.update", entityType: "user", entityId: id, after: body });

  const user = await db
    .prepare(`SELECT id, email, name, status, created_at, last_login_at FROM users WHERE id = ?`)
    .bind(id)
    .first<{ id: string; email: string; name: string; status: string; created_at: string; last_login_at: string | null }>();
  const roles = await rolesByUser(db, [id]);
  return c.json({ ...user, roles: roles.get(id) ?? [] });
});

/** DELETE /api/users/:id — soft delete. */
usersRoutes.delete("/:id", requirePermission("user.manage"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const actorId = c.get("user").id;
  if (id === actorId) throw new HTTPException(400, { message: "cannot_delete_self" });

  const target = await db
    .prepare(`SELECT id FROM users WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<{ id: string }>();
  if (!target) throw new HTTPException(404, { message: "not_found" });

  const owners = await activeOwnerIds(db);
  if (owners.has(id) && owners.size <= 1) throw new HTTPException(400, { message: "last_owner" });

  await db.batch([
    db.prepare(`UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ?`).bind(nowIso(), nowIso(), id),
    db.prepare(`DELETE FROM user_roles WHERE user_id = ?`).bind(id),
    db.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).bind(nowIso(), id),
  ]);
  await writeAudit(db, { actorId, action: "user.delete", entityType: "user", entityId: id });
  return c.json({ ok: true });
});

async function roleIdsIncludeOwner(db: Db, roleIds: string[]): Promise<boolean> {
  if (roleIds.length === 0) return false;
  const placeholders = roleIds.map(() => "?").join(", ");
  const row = await db
    .prepare(`SELECT 1 AS x FROM roles WHERE key = 'owner' AND id IN (${placeholders}) LIMIT 1`)
    .bind(...roleIds)
    .first<{ x: number }>();
  return !!row;
}
