/** Google Calendar integration routes (SRS §6.7, §7.8). */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { setCalendarSchema } from "@tuition/shared";
import type { AppContext } from "../types";
import { parseBody } from "../lib/validate";
import { nowIso } from "../lib/id";
import { signJwt, verifyJwt } from "../lib/jwt";
import { writeAudit } from "../lib/db";
import { authenticate, requirePermission } from "../middleware/auth";
import {
  buildAuthUrl,
  exchangeCode,
  fetchUserEmail,
  listCalendars,
  getIntegration,
  saveConnection,
  disconnect,
  getValidAccessToken,
} from "../lib/google";

export const integrationsRoutes = new Hono<AppContext>();

const redirectUriFor = (url: string) => `${new URL(url).origin}/api/integrations/google/callback`;
const adminOrigin = (cors?: string) => (cors?.split(",")[0]?.trim() ?? "http://localhost:5173");
const manage = requirePermission("integration.manage");

/** GET /api/integrations/google — connection status. */
integrationsRoutes.get("/google", authenticate, manage, async (c) => {
  const row = await getIntegration(c.get("db"));
  return c.json({
    connected: !!row,
    account_email: row?.account_email ?? null,
    calendar_id: row?.calendar_id ?? null,
  });
});

/** GET /api/integrations/google/connect — returns the OAuth consent URL. */
integrationsRoutes.get("/google/connect", authenticate, manage, async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) throw new HTTPException(400, { message: "google_not_configured" });
  const nowSec = Math.floor(Date.now() / 1000);
  const state = await signJwt({ sub: "oauth-state", email: "google", name: "state", iat: nowSec, exp: nowSec + 600 }, c.env.JWT_SECRET);
  return c.json({ url: buildAuthUrl(c.env, redirectUriFor(c.req.url), state) });
});

/** GET /api/integrations/google/callback — OAuth redirect target (public). */
integrationsRoutes.get("/google/callback", async (c) => {
  const admin = adminOrigin(c.env.CORS_ORIGINS);
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state || !(await verifyJwt(state, c.env.JWT_SECRET))) {
    return c.redirect(`${admin}/settings?google=error`);
  }
  try {
    const tokens = await exchangeCode(c.env, code, redirectUriFor(c.req.url));
    const email = await fetchUserEmail(tokens.access_token);
    await saveConnection(c.get("db"), c.env, { tokens, email, connectedBy: null });
    return c.redirect(`${admin}/settings?google=connected`);
  } catch {
    return c.redirect(`${admin}/settings?google=error`);
  }
});

/** GET /api/integrations/google/calendars — writable calendars to choose a target. */
integrationsRoutes.get("/google/calendars", authenticate, manage, async (c) => {
  const token = await getValidAccessToken(c.get("db"), c.env);
  if (!token) throw new HTTPException(400, { message: "not_connected" });
  return c.json({ calendars: await listCalendars(token) });
});

/** PATCH /api/integrations/google — set the target calendar. */
integrationsRoutes.patch("/google", authenticate, manage, async (c) => {
  const body = await parseBody(c, setCalendarSchema);
  const db = c.get("db");
  if (!(await getIntegration(db))) throw new HTTPException(400, { message: "not_connected" });
  await db.prepare(`UPDATE integration_accounts SET calendar_id = ?, updated_at = ? WHERE provider = 'google'`).bind(body.calendar_id, nowIso()).run();
  await writeAudit(db, { actorId: c.get("user").id, action: "integration.google.set_calendar", entityType: "integration", entityId: null, after: { calendar_id: body.calendar_id } });
  return c.json({ ok: true });
});

/** POST /api/integrations/google/disconnect — remove the connection. */
integrationsRoutes.post("/google/disconnect", authenticate, manage, async (c) => {
  await disconnect(c.get("db"));
  await writeAudit(c.get("db"), { actorId: c.get("user").id, action: "integration.google.disconnect", entityType: "integration", entityId: null });
  return c.json({ ok: true });
});
