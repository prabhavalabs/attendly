/**
 * Idempotent seeding of the permission catalog and the default system roles
 * (SRS §11.8, FR-1.4). Returns a map of role key → role id.
 */
import { PERMISSIONS, DEFAULT_ROLE_LIST } from "@tuition/shared";
import type { Db } from "../types";
import { newId, nowIso } from "./id";

export async function seedPermissionsAndRoles(db: Db): Promise<Map<string, string>> {
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];

  // 1. Permission catalog (idempotent).
  for (const p of PERMISSIONS) {
    stmts.push(
      db
        .prepare(`INSERT OR IGNORE INTO permissions (key, resource, action, label) VALUES (?, ?, ?, ?)`)
        .bind(p.key, p.resource, p.action, p.label),
    );
  }

  // 2. Default roles — reuse existing ids where present.
  const existing = await db.prepare(`SELECT id, key FROM roles`).all<{ id: string; key: string }>();
  const roleIdByKey = new Map<string, string>();
  for (const r of existing.results ?? []) roleIdByKey.set(r.key, r.id);

  for (const role of DEFAULT_ROLE_LIST) {
    let id = roleIdByKey.get(role.key);
    if (!id) {
      id = newId("rol");
      roleIdByKey.set(role.key, id);
      stmts.push(
        db
          .prepare(
            `INSERT INTO roles (id, key, label, description, system, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)`,
          )
          .bind(id, role.key, role.label, role.description, now, now),
      );
    }
    for (const perm of role.permissions) {
      stmts.push(
        db
          .prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)`)
          .bind(id, perm),
      );
    }
  }

  await db.batch(stmts);
  return roleIdByKey;
}
