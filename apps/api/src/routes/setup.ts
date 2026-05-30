/**
 * POST /api/setup — first-boot bootstrap (SRS §11.8).
 * Seeds the permission catalog + default roles, creates the owner user, and
 * seeds base settings. Refuses to run once a user exists, unless a matching
 * SETUP_TOKEN is supplied. Never creates a duplicate owner.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../types";
import { parseBody } from "../lib/validate";
import { hashPassword } from "../lib/crypto";
import { newId, nowIso } from "../lib/id";
import { seedPermissionsAndRoles } from "../lib/seed";
import { writeAudit } from "../lib/db";

const setupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(8, "Use at least 8 characters").max(200),
    org_name: z.string().trim().min(1).max(120).optional(),
    setup_token: z.string().optional(),
  })
  .strict();

export const setupRoutes = new Hono<AppContext>();

setupRoutes.post("/", async (c) => {
  const body = await parseBody(c, setupSchema);
  const db = c.get("db");

  const userCount = await db.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>();
  if ((userCount?.n ?? 0) > 0) {
    if (!c.env.SETUP_TOKEN || body.setup_token !== c.env.SETUP_TOKEN) {
      throw new HTTPException(403, { message: "setup_already_completed" });
    }
  }

  const roleIds = await seedPermissionsAndRoles(db);
  const ownerRoleId = roleIds.get("owner");
  if (!ownerRoleId) throw new HTTPException(500, { message: "seed_failed" });

  const existing = await db
    .prepare(`SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`)
    .bind(body.email)
    .first<{ id: string }>();
  if (existing) throw new HTTPException(409, { message: "email_taken" });

  const userId = newId("usr");
  const now = nowIso();
  const passwordHash = await hashPassword(body.password);

  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      )
      .bind(userId, body.email, body.name, passwordHash, now, now),
    db.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`).bind(userId, ownerRoleId),
    db
      .prepare(`INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('org_name', ?, ?)`)
      .bind(body.org_name ?? "ClassDesk", now),
    db
      .prepare(`INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('currency', 'LKR', ?)`)
      .bind(now),
    db
      .prepare(`INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('timezone', 'Asia/Colombo', ?)`)
      .bind(now),
  ]);

  await writeAudit(db, { actorId: userId, action: "auth.setup", entityType: "user", entityId: userId });
  return c.json({ ok: true, user_id: userId }, 201);
});
