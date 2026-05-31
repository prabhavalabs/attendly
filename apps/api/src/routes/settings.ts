/** Org settings routes (SRS §11.8). settings.read / settings.manage. */
import { Hono } from "hono";
import { updateSettingsSchema } from "@tuition/shared";
import type { AppContext, Db } from "../types";
import { parseBody } from "../lib/validate";
import { nowIso } from "../lib/id";
import { writeAudit } from "../lib/db";
import { authenticate, requirePermission } from "../middleware/auth";

const DEFAULTS: Record<string, string> = { org_name: "attendly", currency: "LKR", timezone: "Asia/Colombo" };

async function readSettings(db: Db) {
  const rows = await db.prepare(`SELECT key, value FROM settings`).all<{ key: string; value: string }>();
  const map = new Map((rows.results ?? []).map((r) => [r.key, r.value] as const));
  return {
    org_name: map.get("org_name") ?? DEFAULTS.org_name,
    currency: map.get("currency") ?? DEFAULTS.currency,
    timezone: map.get("timezone") ?? DEFAULTS.timezone,
  };
}

export const settingsRoutes = new Hono<AppContext>();
settingsRoutes.use("*", authenticate);

settingsRoutes.get("/", requirePermission("settings.read"), async (c) => {
  return c.json(await readSettings(c.get("db")));
});

settingsRoutes.patch("/", requirePermission("settings.manage"), async (c) => {
  const body = await parseBody(c, updateSettingsSchema);
  const db = c.get("db");
  const now = nowIso();
  const stmts = Object.entries(body).map(([key, value]) =>
    db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(key, value as string, now),
  );
  if (stmts.length > 0) await db.batch(stmts);
  await writeAudit(db, { actorId: c.get("user").id, action: "settings.update", entityType: "settings", entityId: null, after: body });
  return c.json(await readSettings(db));
});
