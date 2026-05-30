/** Role management + permission catalog (SRS §6.7). Guarded by user.read / user.manage. */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createRoleSchema,
  updateRoleSchema,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
} from "@tuition/shared";
import type { AppContext, Db } from "../types";
import { parseBody } from "../lib/validate";
import { newId, nowIso } from "../lib/id";
import { writeAudit } from "../lib/db";
import { authenticate, requirePermission } from "../middleware/auth";

const PERMISSION_KEY_SET = new Set(PERMISSION_KEYS);

/** Reject unknown permission keys; the `*` wildcard is reserved for the owner role. */
function validatePermissions(perms: string[]): void {
  for (const p of perms) {
    if (!PERMISSION_KEY_SET.has(p)) {
      throw new HTTPException(422, { message: "unknown_permission", cause: { permission: p } });
    }
  }
}

async function loadRole(db: Db, id: string) {
  const role = await db
    .prepare(`SELECT id, key, label, description, system FROM roles WHERE id = ?`)
    .bind(id)
    .first<{ id: string; key: string; label: string; description: string; system: number }>();
  if (!role) return null;
  const perms = await db
    .prepare(`SELECT permission_key FROM role_permissions WHERE role_id = ?`)
    .bind(id)
    .all<{ permission_key: string }>();
  return {
    id: role.id,
    key: role.key,
    label: role.label,
    description: role.description,
    system: role.system === 1,
    permissions: (perms.results ?? []).map((p) => p.permission_key),
  };
}

export const rolesRoutes = new Hono<AppContext>();
rolesRoutes.use("*", authenticate);

/** GET /api/roles — all roles with permissions and assigned-user counts. */
rolesRoutes.get("/", requirePermission("user.read"), async (c) => {
  const db = c.get("db");
  const roles = await db
    .prepare(`SELECT id, key, label, description, system FROM roles ORDER BY system DESC, label`)
    .all<{ id: string; key: string; label: string; description: string; system: number }>();
  const perms = await db
    .prepare(`SELECT role_id, permission_key FROM role_permissions`)
    .all<{ role_id: string; permission_key: string }>();
  const counts = await db
    .prepare(`SELECT role_id, COUNT(*) AS n FROM user_roles GROUP BY role_id`)
    .all<{ role_id: string; n: number }>();

  const permMap = new Map<string, string[]>();
  for (const p of perms.results ?? []) {
    const list = permMap.get(p.role_id) ?? [];
    list.push(p.permission_key);
    permMap.set(p.role_id, list);
  }
  const countMap = new Map((counts.results ?? []).map((r) => [r.role_id, r.n] as const));

  return c.json({
    roles: (roles.results ?? []).map((r) => ({
      id: r.id,
      key: r.key,
      label: r.label,
      description: r.description,
      system: r.system === 1,
      permissions: permMap.get(r.id) ?? [],
      user_count: countMap.get(r.id) ?? 0,
    })),
  });
});

/** POST /api/roles — create a custom role. */
rolesRoutes.post("/", requirePermission("user.manage"), async (c) => {
  const body = await parseBody(c, createRoleSchema);
  validatePermissions(body.permissions);
  const db = c.get("db");

  const clash = await db.prepare(`SELECT id FROM roles WHERE key = ?`).bind(body.key).first<{ id: string }>();
  if (clash) throw new HTTPException(409, { message: "role_key_taken" });

  const id = newId("rol");
  const now = nowIso();
  await db.batch([
    db
      .prepare(
        `INSERT INTO roles (id, key, label, description, system, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(id, body.key, body.label, body.description, now, now),
    ...body.permissions.map((p) =>
      db.prepare(`INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)`).bind(id, p),
    ),
  ]);
  await writeAudit(c.get("db"), {
    actorId: c.get("user").id,
    action: "role.create",
    entityType: "role",
    entityId: id,
    after: body,
  });
  return c.json(await loadRole(db, id), 201);
});

/** PATCH /api/roles/:id — edit label, description and/or permissions. */
rolesRoutes.patch("/:id", requirePermission("user.manage"), async (c) => {
  const body = await parseBody(c, updateRoleSchema);
  const db = c.get("db");
  const id = c.req.param("id");

  const role = await loadRole(db, id);
  if (!role) throw new HTTPException(404, { message: "not_found" });
  // The owner role must always retain the `*` wildcard — its permissions are locked.
  if (role.key === "owner" && body.permissions !== undefined) {
    throw new HTTPException(400, { message: "owner_permissions_locked" });
  }
  if (body.permissions !== undefined) validatePermissions(body.permissions);

  const stmts: D1PreparedStatement[] = [];
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.label !== undefined) { sets.push("label = ?"); binds.push(body.label); }
  if (body.description !== undefined) { sets.push("description = ?"); binds.push(body.description); }
  if (sets.length > 0) {
    sets.push("updated_at = ?"); binds.push(nowIso());
    stmts.push(db.prepare(`UPDATE roles SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id));
  }
  if (body.permissions !== undefined) {
    stmts.push(db.prepare(`DELETE FROM role_permissions WHERE role_id = ?`).bind(id));
    for (const p of body.permissions) {
      stmts.push(db.prepare(`INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)`).bind(id, p));
    }
  }
  if (stmts.length > 0) await db.batch(stmts);
  await writeAudit(db, { actorId: c.get("user").id, action: "role.update", entityType: "role", entityId: id, after: body });
  return c.json(await loadRole(db, id));
});

/** DELETE /api/roles/:id — delete a custom role (system roles and in-use roles are protected). */
rolesRoutes.delete("/:id", requirePermission("user.manage"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const role = await loadRole(db, id);
  if (!role) throw new HTTPException(404, { message: "not_found" });
  if (role.system) throw new HTTPException(400, { message: "cannot_delete_system_role" });

  const inUse = await db
    .prepare(`SELECT COUNT(*) AS n FROM user_roles WHERE role_id = ?`)
    .bind(id)
    .first<{ n: number }>();
  if ((inUse?.n ?? 0) > 0) throw new HTTPException(409, { message: "role_in_use" });

  await db.prepare(`DELETE FROM roles WHERE id = ?`).bind(id).run();
  await writeAudit(db, { actorId: c.get("user").id, action: "role.delete", entityType: "role", entityId: id });
  return c.json({ ok: true });
});

/** GET /api/permissions — the permission catalog, grouped for the matrix UI. */
export const permissionsRoutes = new Hono<AppContext>();
permissionsRoutes.use("*", authenticate);
permissionsRoutes.get("/", requirePermission("user.read"), (c) => {
  return c.json({ groups: PERMISSION_GROUPS });
});
