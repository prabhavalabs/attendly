/** Issue access + refresh tokens and persist the hashed refresh session. */
import type { Context } from "hono";
import type { AppContext, Db, AuthUser } from "../types";
import type { AuthTokens, Me } from "@tuition/shared";
import { signJwt } from "./jwt";
import { randomToken, sha256Hex } from "./crypto";
import { newId, nowIso, isoIn } from "./id";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "./config";

/** Build the /me response payload from a resolved principal. */
export function toMe(user: AuthUser): Me {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    roles: user.roles,
    permissions: [...user.permissions],
  };
}

/**
 * Mint a fresh access token and a new refresh session for `user`.
 * The raw refresh token is returned once; only its SHA-256 hash is stored.
 */
export async function issueTokens(
  c: Context<AppContext>,
  db: Db,
  user: { id: string; email: string; name: string },
): Promise<AuthTokens> {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + ACCESS_TOKEN_TTL_SECONDS;

  const accessToken = await signJwt(
    { sub: user.id, email: user.email, name: user.name, iat: nowSec, exp },
    c.env.JWT_SECRET,
  );

  const refreshToken = randomToken(32);
  const refreshHash = await sha256Hex(refreshToken);
  await db
    .prepare(
      `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, user_agent, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId("ses"),
      user.id,
      refreshHash,
      c.req.header("user-agent") ?? null,
      nowIso(),
      isoIn(REFRESH_TOKEN_TTL_SECONDS),
    )
    .run();

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: new Date(exp * 1000).toISOString(),
  };
}
