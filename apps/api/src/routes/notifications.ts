/** Notification routes (SRS §6.7, §7.7). notification.send. */
import { Hono } from "hono";
import { createNotificationSchema } from "@tuition/shared";
import type { AppContext, Db } from "../types";
import { parseBody } from "../lib/validate";
import { newId, nowIso } from "../lib/id";
import { writeAudit } from "../lib/db";
import { authenticate, requirePermission } from "../middleware/auth";

const COLS = `id, type, title, body, channel, audience, class_id, student_id,
  recipient_count, status, scheduled_at, sent_at, created_at`;

/** Count recipients for an audience (informational; delivery lands in M5). */
async function recipientCount(
  db: Db,
  audience: string,
  classId?: string | null,
  studentId?: string | null,
): Promise<number> {
  if (audience === "all_students") {
    const r = await db.prepare(`SELECT COUNT(*) AS n FROM students WHERE status = 'active' AND deleted_at IS NULL`).first<{ n: number }>();
    return r?.n ?? 0;
  }
  if (audience === "all_guardians") {
    const r = await db.prepare(`SELECT COUNT(*) AS n FROM guardians`).first<{ n: number }>();
    return r?.n ?? 0;
  }
  if (audience === "class" && classId) {
    const r = await db.prepare(`SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ? AND status = 'active'`).bind(classId).first<{ n: number }>();
    return r?.n ?? 0;
  }
  if (audience === "student") return 1;
  return 0;
}

export const notificationsRoutes = new Hono<AppContext>();
notificationsRoutes.use("*", authenticate);

notificationsRoutes.get("/", requirePermission("notification.send"), async (c) => {
  const rows = await c
    .get("db")
    .prepare(`SELECT ${COLS} FROM notifications ORDER BY created_at DESC LIMIT 50`)
    .all();
  return c.json({ notifications: rows.results ?? [] });
});

notificationsRoutes.post("/", requirePermission("notification.send"), async (c) => {
  const body = await parseBody(c, createNotificationSchema);
  const db = c.get("db");
  const now = nowIso();
  const id = newId("ntf");
  const count = await recipientCount(db, body.audience, body.class_id, body.student_id);

  // Future schedule → queued; otherwise recorded as sent now (no provider yet).
  const scheduled = body.scheduled_at && body.scheduled_at > now ? body.scheduled_at : null;
  const status = scheduled ? "queued" : "sent";
  const sentAt = scheduled ? null : now;

  await db
    .prepare(
      `INSERT INTO notifications
         (id, type, title, body, channel, audience, class_id, student_id, recipient_count, status, scheduled_at, sent_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, body.type, body.title, body.body, body.channel, body.audience,
      body.class_id ?? null, body.student_id ?? null, count, status, scheduled, sentAt, c.get("user").id, now, now,
    )
    .run();
  await writeAudit(db, { actorId: c.get("user").id, action: "notification.send", entityType: "notification", entityId: id, after: { audience: body.audience, status, recipient_count: count } });

  const row = await db.prepare(`SELECT ${COLS} FROM notifications WHERE id = ?`).bind(id).first();
  return c.json(row, 201);
});
