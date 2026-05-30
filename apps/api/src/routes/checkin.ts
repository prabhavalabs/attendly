/** Check-in routes (SRS §6.4): single + batch (offline sync). attendance.record. */
import { Hono } from "hono";
import type { Context } from "hono";
import { checkinSchema, checkinBatchSchema, type CheckinInput, type CheckinResult } from "@tuition/shared";
import type { AppContext } from "../types";
import { parseBody } from "../lib/validate";
import { resolveStudent, recordAttendance, paymentAlert } from "../lib/attendance";
import { authenticate, requirePermission } from "../middleware/auth";

export const checkinRoutes = new Hono<AppContext>();
checkinRoutes.use("*", authenticate);

async function processOne(c: Context<AppContext>, body: CheckinInput): Promise<CheckinResult> {
  const db = c.get("db");
  const key = body.client_dedup_key ?? null;

  const session = await db.prepare(`SELECT id FROM class_sessions WHERE id = ?`).bind(body.session_id).first<{ id: string }>();
  if (!session) {
    return { ok: false, error: "session_not_found", client_dedup_key: key, student: null, attendance: null, payment_alert: null };
  }

  const student = await resolveStudent(db, body);
  if (!student) {
    return { ok: false, error: "student_not_found", client_dedup_key: key, student: null, attendance: null, payment_alert: null };
  }

  const attendance = await recordAttendance(db, {
    sessionId: body.session_id,
    studentId: student.id,
    status: body.status,
    method: body.method,
    clientDedupKey: key,
    checkedInAt: body.checked_in_at ?? null,
    actorId: c.get("user").id,
  });

  return {
    ok: true,
    client_dedup_key: key,
    student,
    attendance,
    payment_alert: await paymentAlert(db, student.id),
  };
}

/** POST /api/checkin — single check-in (qr / nfc / search / manual). */
checkinRoutes.post("/", requirePermission("attendance.record"), async (c) => {
  const body = await parseBody(c, checkinSchema);
  return c.json(await processOne(c, body));
});

/** POST /api/checkin/batch — offline queue sync; each item resolved idempotently. */
checkinRoutes.post("/batch", requirePermission("attendance.record"), async (c) => {
  const { items } = await parseBody(c, checkinBatchSchema);
  const results: CheckinResult[] = [];
  for (const item of items) results.push(await processOne(c, item));
  return c.json({ results });
});
