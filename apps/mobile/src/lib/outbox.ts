/**
 * Offline check-in queue + sync engine (SRS §10).
 *
 * Every check-in is written to the local `outbox` first (so the door keeps
 * working offline), then `flush()` drains pending rows to POST
 * /api/checkin/batch. The server dedups on `client_dedup_key`, so retries and
 * replays are safe. Results are matched back by that key.
 */
import type { CheckinInput, CheckinBatchResult, CheckinMethod, AttendanceStatus } from "@tuition/shared";
import { getDb, readRoster, type OutboxRow } from "./db";
import { api, ApiError } from "./api";
import { uuid } from "./uuid";

export interface EnqueueInput {
  sessionId: string;
  method: CheckinMethod;
  status?: AttendanceStatus;
  studentId?: string;
  cardToken?: string;
  regNo?: string;
}

/** Queue a check-in locally and return the new outbox row id (dedup key). */
export async function enqueue(input: EnqueueInput): Promise<string> {
  const db = await getDb();
  const id = uuid();
  const now = new Date().toISOString();

  // Resolve a display name from the cached roster when we know the student.
  let resolvedName: string | null = null;
  if (input.studentId) {
    const roster = await readRoster(input.sessionId);
    resolvedName = roster.find((r) => r.student_id === input.studentId)?.full_name ?? null;
  }

  await db.runAsync(
    `INSERT INTO outbox
       (id, session_id, student_id, card_token, reg_no, method, status, checked_in_at, synced, duplicate, resolved_name, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, NULL, ?)`,
    id,
    input.sessionId,
    input.studentId ?? null,
    input.cardToken ?? null,
    input.regNo ?? null,
    input.method,
    input.status ?? "present",
    now,
    resolvedName,
    now,
  );
  return id;
}

export async function recent(sessionId: string, limit = 50): Promise<OutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`,
    sessionId,
    limit,
  );
}

export async function pendingCount(sessionId?: string): Promise<number> {
  const db = await getDb();
  const row = sessionId
    ? await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox WHERE synced = 0 AND session_id = ?`, sessionId)
    : await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox WHERE synced = 0`);
  return row?.n ?? 0;
}

function toItem(row: OutboxRow): CheckinInput {
  return {
    session_id: row.session_id,
    method: row.method as CheckinMethod,
    status: row.status as AttendanceStatus,
    client_dedup_key: row.id,
    checked_in_at: row.checked_in_at,
    ...(row.student_id ? { student_id: row.student_id } : {}),
    ...(row.card_token ? { card_token: row.card_token } : {}),
    ...(row.reg_no ? { reg_no: row.reg_no } : {}),
  };
}

export interface FlushResult {
  attempted: number;
  synced: number;
  offline: boolean;
}

let flushing = false;

/**
 * Drain all pending outbox rows to the server in one batch.
 * Network/connection errors leave rows queued (treated as offline).
 */
export async function flush(): Promise<FlushResult> {
  if (flushing) return { attempted: 0, synced: 0, offline: false };
  flushing = true;
  try {
    const db = await getDb();
    const pending = await db.getAllAsync<OutboxRow>(
      `SELECT * FROM outbox WHERE synced = 0 ORDER BY created_at ASC LIMIT 500`,
    );
    if (pending.length === 0) return { attempted: 0, synced: 0, offline: false };

    let result: CheckinBatchResult;
    try {
      result = await api.post<CheckinBatchResult>("/api/checkin/batch", {
        items: pending.map(toItem),
      });
    } catch (err) {
      // 4xx/5xx from the server is a real error we surface; a thrown fetch
      // (no network) means we're offline — keep everything queued.
      if (err instanceof ApiError && err.status >= 400) {
        return { attempted: pending.length, synced: 0, offline: false };
      }
      return { attempted: pending.length, synced: 0, offline: true };
    }

    let synced = 0;
    await db.withTransactionAsync(async () => {
      for (const r of result.results) {
        if (!r.client_dedup_key) continue;
        const duplicate = r.attendance?.duplicate ? 1 : 0;
        const name = r.student?.full_name ?? null;
        const error = r.ok ? null : (r.error ?? "failed");
        // Mark synced only when the server accepted it; failed items (e.g.
        // student_not_found) are recorded but left unsynced for visibility.
        await db.runAsync(
          `UPDATE outbox SET synced = ?, duplicate = ?, resolved_name = COALESCE(?, resolved_name), error = ? WHERE id = ?`,
          r.ok ? 1 : 0,
          duplicate,
          name,
          error,
          r.client_dedup_key,
        );
        if (r.ok) synced++;
      }
    });
    return { attempted: pending.length, synced, offline: false };
  } finally {
    flushing = false;
  }
}
