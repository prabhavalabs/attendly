/** Auth routes: login, refresh, logout, me (SRS §6.2). */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { loginSchema, refreshSchema } from "@tuition/shared";
import type { AppContext } from "../types";
import { parseBody } from "../lib/validate";
import { verifyPassword, sha256Hex } from "../lib/crypto";
import { loadAuthUser, writeAudit } from "../lib/db";
import { issueTokens, toMe } from "../lib/tokens";
import { nowIso } from "../lib/id";
import { authenticate } from "../middleware/auth";

// A well-formed but non-matching hash, used to equalize timing when the email
// is unknown (mitigates user enumeration via response time).
const DUMMY_HASH =
  "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export const authRoutes = new Hono<AppContext>();

/** POST /api/auth/login — email + password → tokens + user. */
authRoutes.post("/login", async (c) => {
  const { email, password } = await parseBody(c, loginSchema);
  const db = c.get("db");

  const row = await db
    .prepare(
      `SELECT id, email, name, password_hash, status
         FROM users WHERE email = ? AND deleted_at IS NULL`,
    )
    .bind(email)
    .first<{ id: string; email: string; name: string; password_hash: string; status: string }>();

  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) throw new HTTPException(401, { message: "invalid_credentials" });
  if (row.status !== "active") throw new HTTPException(403, { message: "account_suspended" });

  const tokens = await issueTokens(c, db, row);
  await db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).bind(nowIso(), row.id).run();
  await writeAudit(db, { actorId: row.id, action: "auth.login", entityType: "user", entityId: row.id });

  const user = await loadAuthUser(db, row.id);
  if (!user) throw new HTTPException(401, { message: "invalid_credentials" });
  return c.json({ tokens, user: toMe(user) });
});

/** POST /api/auth/refresh — rotate the refresh session, issue a new access token. */
authRoutes.post("/refresh", async (c) => {
  const { refresh_token } = await parseBody(c, refreshSchema);
  const db = c.get("db");
  const hash = await sha256Hex(refresh_token);

  const session = await db
    .prepare(
      `SELECT id, user_id, expires_at, revoked_at
         FROM auth_sessions WHERE refresh_token_hash = ?`,
    )
    .bind(hash)
    .first<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>();

  if (!session || session.revoked_at || session.expires_at <= nowIso()) {
    throw new HTTPException(401, { message: "invalid_token" });
  }

  const user = await loadAuthUser(db, session.user_id);
  if (!user) throw new HTTPException(401, { message: "invalid_token" });
  if (user.status !== "active") throw new HTTPException(403, { message: "account_suspended" });

  // Rotate: revoke the presented session, mint a fresh pair.
  await db.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE id = ?`).bind(nowIso(), session.id).run();
  const tokens = await issueTokens(c, db, user);
  return c.json({ tokens, user: toMe(user) });
});

/** POST /api/auth/logout — revoke a refresh session. */
authRoutes.post("/logout", authenticate, async (c) => {
  const { refresh_token } = await parseBody(c, refreshSchema);
  const db = c.get("db");
  const hash = await sha256Hex(refresh_token);
  await db
    .prepare(
      `UPDATE auth_sessions SET revoked_at = ?
        WHERE refresh_token_hash = ? AND user_id = ? AND revoked_at IS NULL`,
    )
    .bind(nowIso(), hash, c.get("user").id)
    .run();
  return c.json({ ok: true });
});

/** GET /api/auth/me — current user + roles + permissions. */
authRoutes.get("/me", authenticate, (c) => {
  return c.json(toMe(c.get("user")));
});
