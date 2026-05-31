/**
 * Google OAuth + Calendar sync (SRS §7.8). Tokens are AES-GCM encrypted at rest.
 * All network calls are pure fetch (Workers-compatible). Sync failures never
 * throw to callers — calendar is best-effort and must not block session writes.
 */
import type { Env, Db } from "../types";
import { aesEncrypt, aesDecrypt } from "./crypto";
import { newId, nowIso, isoIn } from "./id";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/userinfo.email"];

export interface GoogleIntegration {
  id: string;
  account_email: string | null;
  calendar_id: string | null;
  token_expires_at: string | null;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/** OAuth consent URL (offline access + forced consent to always get a refresh token). */
export function buildAuthUrl(env: Env, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export async function exchangeCode(env: Env, code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token_exchange_failed_${res.status}`);
  return res.json();
}

async function refreshAccessToken(env: Env, refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token_refresh_failed_${res.status}`);
  return res.json();
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

export async function listCalendars(accessToken: string): Promise<{ id: string; summary: string; primary?: boolean }[]> {
  const res = await fetch(`${CAL_BASE}/users/me/calendarList?minAccessRole=writer`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: { id: string; summary: string; primary?: boolean }[] };
  return (data.items ?? []).map((i) => ({ id: i.id, summary: i.summary, primary: i.primary }));
}

/* ------------------------------ persistence ------------------------------ */

export async function getIntegration(db: Db): Promise<GoogleIntegration | null> {
  return db
    .prepare(`SELECT id, account_email, calendar_id, token_expires_at FROM integration_accounts WHERE provider = 'google'`)
    .first<GoogleIntegration>();
}

export async function saveConnection(
  db: Db,
  env: Env,
  opts: { tokens: TokenResponse; email: string | null; connectedBy: string | null },
): Promise<void> {
  const now = nowIso();
  const accessEnc = await aesEncrypt(opts.tokens.access_token, env.ENCRYPTION_KEY);
  const refreshEnc = opts.tokens.refresh_token ? await aesEncrypt(opts.tokens.refresh_token, env.ENCRYPTION_KEY) : null;
  const expires = isoIn(opts.tokens.expires_in);

  const existing = await getIntegration(db);
  if (existing) {
    // Keep the prior refresh token if Google didn't return a new one.
    await db
      .prepare(
        `UPDATE integration_accounts SET account_email = ?, access_token_enc = ?,
           refresh_token_enc = COALESCE(?, refresh_token_enc), token_expires_at = ?, scope = ?, updated_at = ?
         WHERE provider = 'google'`,
      )
      .bind(opts.email, accessEnc, refreshEnc, expires, opts.tokens.scope ?? null, now)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO integration_accounts (id, provider, connected_by, account_email, access_token_enc, refresh_token_enc, token_expires_at, scope, created_at, updated_at)
         VALUES (?, 'google', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(newId("int"), opts.connectedBy, opts.email, accessEnc, refreshEnc, expires, opts.tokens.scope ?? null, now, now)
      .run();
  }
}

export async function disconnect(db: Db): Promise<void> {
  await db.prepare(`DELETE FROM integration_accounts WHERE provider = 'google'`).run();
}

/** Return a valid access token, refreshing if near expiry. Null if not connected. */
export async function getValidAccessToken(db: Db, env: Env): Promise<string | null> {
  const row = await db
    .prepare(`SELECT access_token_enc, refresh_token_enc, token_expires_at FROM integration_accounts WHERE provider = 'google'`)
    .first<{ access_token_enc: string | null; refresh_token_enc: string | null; token_expires_at: string | null }>();
  if (!row?.access_token_enc) return null;

  const notExpired = row.token_expires_at && row.token_expires_at > isoIn(60);
  if (notExpired) return aesDecrypt(row.access_token_enc, env.ENCRYPTION_KEY);

  if (!row.refresh_token_enc) return aesDecrypt(row.access_token_enc, env.ENCRYPTION_KEY);
  const refresh = await aesDecrypt(row.refresh_token_enc, env.ENCRYPTION_KEY);
  if (!refresh) return null;
  try {
    const tok = await refreshAccessToken(env, refresh);
    await db
      .prepare(`UPDATE integration_accounts SET access_token_enc = ?, token_expires_at = ?, updated_at = ? WHERE provider = 'google'`)
      .bind(await aesEncrypt(tok.access_token, env.ENCRYPTION_KEY), isoIn(tok.expires_in), nowIso())
      .run();
    return tok.access_token;
  } catch {
    return null;
  }
}

/* ------------------------------ event sync ------------------------------- */

interface SessionRow {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  topic: string | null;
  gcal_event_id: string | null;
  class_name: string;
}

async function timezone(db: Db): Promise<string> {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'timezone'`).first<{ value: string }>();
  return row?.value ?? "Asia/Colombo";
}

/**
 * Push a session to Google Calendar (create/update/delete based on status).
 * Best-effort: any failure is swallowed so it never blocks the session write.
 */
export async function syncSessionToCalendar(db: Db, env: Env, sessionId: string): Promise<void> {
  try {
    const integration = await getIntegration(db);
    if (!integration?.calendar_id) return;
    const accessToken = await getValidAccessToken(db, env);
    if (!accessToken) return;

    const s = await db
      .prepare(
        `SELECT cs.id, cs.session_date, cs.start_time, cs.end_time, cs.status, cs.topic, cs.gcal_event_id, c.name AS class_name
           FROM class_sessions cs JOIN classes c ON c.id = cs.class_id WHERE cs.id = ?`,
      )
      .bind(sessionId)
      .first<SessionRow>();
    if (!s) return;

    const calId = encodeURIComponent(integration.calendar_id);
    const auth = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    if (s.status === "cancelled") {
      if (s.gcal_event_id) {
        await fetch(`${CAL_BASE}/calendars/${calId}/events/${encodeURIComponent(s.gcal_event_id)}`, { method: "DELETE", headers: auth });
        await db.prepare(`UPDATE class_sessions SET gcal_event_id = NULL WHERE id = ?`).bind(s.id).run();
      }
      return;
    }

    const tz = await timezone(db);
    const event = {
      summary: s.topic ? `${s.class_name} — ${s.topic}` : s.class_name,
      start: { dateTime: `${s.session_date}T${s.start_time}:00`, timeZone: tz },
      end: { dateTime: `${s.session_date}T${s.end_time}:00`, timeZone: tz },
    };

    if (s.gcal_event_id) {
      await fetch(`${CAL_BASE}/calendars/${calId}/events/${encodeURIComponent(s.gcal_event_id)}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify(event),
      });
    } else {
      const res = await fetch(`${CAL_BASE}/calendars/${calId}/events`, { method: "POST", headers: auth, body: JSON.stringify(event) });
      if (res.ok) {
        const created = (await res.json()) as { id?: string };
        if (created.id) {
          await db.prepare(`UPDATE class_sessions SET gcal_event_id = ? WHERE id = ?`).bind(created.id, s.id).run();
        }
      }
    }
  } catch {
    // best-effort; never block the caller
  }
}
