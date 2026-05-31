/**
 * Auth & RBAC middleware (SRS §6.1, §7.1).
 *   - dbSession:        open a D1 Sessions-API session, echo the bookmark
 *   - authenticate:     verify the Bearer JWT, resolve the principal
 *   - requirePermission: authoritative server-side permission guard
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { hasPermission } from "@tuition/shared";
import type { AppContext } from "../types";
import { D1_BOOKMARK_HEADER, openSession, loadAuthUser } from "../lib/db";
import { verifyJwt } from "../lib/jwt";

/** Open a D1 session per request and return the latest bookmark to the client. */
export const dbSession = createMiddleware<AppContext>(async (c, next) => {
  const bookmark = c.req.header(D1_BOOKMARK_HEADER) ?? null;
  const db = openSession(c.env, bookmark);
  c.set("db", db);
  await next();
  const latest = db.getBookmark();
  if (latest) c.header(D1_BOOKMARK_HEADER, latest);
});

/** Require a valid access token; resolve roles + permissions onto the context. */
export const authenticate = createMiddleware<AppContext>(async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "unauthorized" });
  }
  const payload = await verifyJwt(header.slice(7), c.env.JWT_SECRET);
  if (!payload) throw new HTTPException(401, { message: "invalid_token" });

  const user = await loadAuthUser(c.get("db"), payload.sub);
  if (!user) throw new HTTPException(401, { message: "invalid_token" });
  if (user.status !== "active") throw new HTTPException(403, { message: "account_suspended" });

  c.set("user", user);
  await next();
});

/** Guard a route on a single permission key (e.g. `user.manage`). */
export function requirePermission(permission: string) {
  return createMiddleware<AppContext>(async (c, next) => {
    const user = c.get("user");
    if (!user || !hasPermission(user.permissions, permission)) {
      throw new HTTPException(403, { message: "forbidden" });
    }
    await next();
  });
}
