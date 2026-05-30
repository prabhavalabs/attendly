/**
 * Attendance core — student resolution + idempotent recording (SRS §7.4).
 * Shared by /api/checkin (card/search/manual) so the rule lives in one place.
 *   - manual marks UPDATE an existing record (edit prior record, FR-4.6, audited)
 *   - qr/nfc/search check-ins are first-write-wins (duplicate flagged, never error)
 *   - client_dedup_key short-circuits offline replays (SRS §10)
 */
import type { Db } from "../types";
import type { AttendanceStatus, CheckinMethod, PaymentAlert } from "@tuition/shared";
import { newId, nowIso } from "./id";
import { writeAudit } from "./db";

export interface ResolvedStudent {
  id: string;
  reg_no: string;
  full_name: string;
  photo_url: string | null;
}

/** Resolve by student_id, then card_token (active cards only), then reg_no. */
export async function resolveStudent(
  db: Db,
  ident: { card_token?: string; student_id?: string; reg_no?: string },
): Promise<ResolvedStudent | null> {
  const cols = "id, reg_no, full_name, photo_url";
  if (ident.student_id) {
    return db.prepare(`SELECT ${cols} FROM students WHERE id = ? AND deleted_at IS NULL`).bind(ident.student_id).first<ResolvedStudent>();
  }
  if (ident.card_token) {
    return db
      .prepare(`SELECT ${cols} FROM students WHERE card_token = ? AND card_status = 'active' AND deleted_at IS NULL`)
      .bind(ident.card_token)
      .first<ResolvedStudent>();
  }
  if (ident.reg_no) {
    return db.prepare(`SELECT ${cols} FROM students WHERE reg_no = ? AND deleted_at IS NULL`).bind(ident.reg_no).first<ResolvedStudent>();
  }
  return null;
}

export interface RecordResult {
  status: AttendanceStatus;
  method: CheckinMethod;
  duplicate: boolean;
}

export async function recordAttendance(
  db: Db,
  opts: {
    sessionId: string;
    studentId: string;
    status: AttendanceStatus;
    method: CheckinMethod;
    clientDedupKey?: string | null;
    checkedInAt?: string | null;
    actorId: string | null;
  },
): Promise<RecordResult> {
  const now = nowIso();
  const checkedInAt = opts.checkedInAt ?? now;

  // Offline replay: a seen dedup key returns the prior result, never a new row.
  if (opts.clientDedupKey) {
    const dup = await db
      .prepare(`SELECT status, method FROM attendance WHERE client_dedup_key = ?`)
      .bind(opts.clientDedupKey)
      .first<{ status: AttendanceStatus; method: CheckinMethod }>();
    if (dup) return { status: dup.status, method: dup.method, duplicate: true };
  }

  const existing = await db
    .prepare(`SELECT id, status, method FROM attendance WHERE session_id = ? AND student_id = ?`)
    .bind(opts.sessionId, opts.studentId)
    .first<{ id: string; status: AttendanceStatus; method: CheckinMethod }>();

  if (existing) {
    if (opts.method === "manual") {
      await db
        .prepare(`UPDATE attendance SET status = ?, method = 'manual', recorded_by = ?, checked_in_at = ?, updated_at = ? WHERE id = ?`)
        .bind(opts.status, opts.actorId, checkedInAt, now, existing.id)
        .run();
      await writeAudit(db, {
        actorId: opts.actorId,
        action: "attendance.update",
        entityType: "attendance",
        entityId: existing.id,
        before: { status: existing.status },
        after: { status: opts.status },
      });
      return { status: opts.status, method: "manual", duplicate: false };
    }
    // qr/nfc/search: idempotent — first write wins.
    return { status: existing.status, method: existing.method, duplicate: true };
  }

  const id = newId("att");
  await db
    .prepare(
      `INSERT INTO attendance (id, session_id, student_id, status, method, client_dedup_key, recorded_by, checked_in_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, opts.sessionId, opts.studentId, opts.status, opts.method, opts.clientDedupKey ?? null, opts.actorId, checkedInAt, now, now)
    .run();
  await writeAudit(db, {
    actorId: opts.actorId,
    action: "attendance.record",
    entityType: "attendance",
    entityId: id,
    after: { session_id: opts.sessionId, student_id: opts.studentId, status: opts.status, method: opts.method },
  });
  return { status: opts.status, method: opts.method, duplicate: false };
}

/**
 * Informational payment alert (never blocks check-in, SRS FR-4.5).
 * Invoices arrive in M4; until then nothing is outstanding.
 */
export async function paymentAlert(_db: Db, _studentId: string): Promise<PaymentAlert> {
  return { has_outstanding: false, overdue_periods: [], outstanding_minor: 0 };
}
