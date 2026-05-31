/**
 * Local persistence (expo-sqlite) for offline-first door check-in (SRS §10).
 *
 *   - `roster`  : per-session student list prefetched while online, so manual /
 *                 search check-in and name display keep working offline.
 *   - `outbox`  : queued check-ins not yet confirmed by the server. Synced to
 *                 POST /api/checkin/batch; the server dedups on client_dedup_key.
 *   - `sessions`: lightweight session headers for offline display.
 */
import * as SQLite from "expo-sqlite";
import { DB_NAME } from "./config";

export interface RosterRow {
  session_id: string;
  student_id: string;
  reg_no: string;
  full_name: string;
  photo_url: string | null;
  status: string;
  card_status: string;
  att_status: string | null;
}

export interface OutboxRow {
  id: string; // client_dedup_key
  session_id: string;
  student_id: string | null;
  card_token: string | null;
  reg_no: string | null;
  method: string;
  status: string;
  checked_in_at: string;
  synced: number; // 0 | 1
  duplicate: number; // 0 | 1
  resolved_name: string | null;
  error: string | null;
  created_at: string;
}

export interface SessionRow {
  id: string;
  class_name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS roster (
          session_id  TEXT NOT NULL,
          student_id  TEXT NOT NULL,
          reg_no      TEXT NOT NULL,
          full_name   TEXT NOT NULL,
          photo_url   TEXT,
          status      TEXT NOT NULL,
          card_status TEXT NOT NULL,
          att_status  TEXT,
          PRIMARY KEY (session_id, student_id)
        );
        CREATE TABLE IF NOT EXISTS outbox (
          id            TEXT PRIMARY KEY,
          session_id    TEXT NOT NULL,
          student_id    TEXT,
          card_token    TEXT,
          reg_no        TEXT,
          method        TEXT NOT NULL,
          status        TEXT NOT NULL,
          checked_in_at TEXT NOT NULL,
          synced        INTEGER NOT NULL DEFAULT 0,
          duplicate     INTEGER NOT NULL DEFAULT 0,
          resolved_name TEXT,
          error         TEXT,
          created_at    TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_outbox_session ON outbox (session_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox (synced);
        CREATE TABLE IF NOT EXISTS sessions (
          id           TEXT PRIMARY KEY,
          class_name   TEXT NOT NULL,
          session_date TEXT NOT NULL,
          start_time   TEXT NOT NULL,
          end_time     TEXT NOT NULL,
          status       TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

/** Replace the cached roster for a session in one transaction. */
export async function cacheRoster(sessionId: string, rows: RosterRow[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM roster WHERE session_id = ?`, sessionId);
    for (const r of rows) {
      await db.runAsync(
        `INSERT OR REPLACE INTO roster
           (session_id, student_id, reg_no, full_name, photo_url, status, card_status, att_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        r.session_id,
        r.student_id,
        r.reg_no,
        r.full_name,
        r.photo_url,
        r.status,
        r.card_status,
        r.att_status,
      );
    }
  });
}

export async function readRoster(sessionId: string): Promise<RosterRow[]> {
  const db = await getDb();
  return db.getAllAsync<RosterRow>(
    `SELECT * FROM roster WHERE session_id = ? ORDER BY full_name`,
    sessionId,
  );
}

export async function cacheSession(s: SessionRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO sessions (id, class_name, session_date, start_time, end_time, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    s.id,
    s.class_name,
    s.session_date,
    s.start_time,
    s.end_time,
    s.status,
  );
}

export async function readSession(id: string): Promise<SessionRow | null> {
  const db = await getDb();
  return db.getFirstAsync<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, id);
}
