/**
 * attendly API — Cloudflare Worker (Hono).
 *
 * Wires CORS, the standard error envelope, the D1 Sessions middleware, and the
 * M0 auth/RBAC routes. Business modules (students, check-in, billing, …) mount
 * here as they are built. See SRS §6 (API spec) and §11.5.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { AppContext, Env } from "./types";
import { dbSession } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { setupRoutes } from "./routes/setup";
import { usersRoutes } from "./routes/users";
import { rolesRoutes, permissionsRoutes } from "./routes/roles";
import { studentsRoutes } from "./routes/students";
import { lecturersRoutes } from "./routes/lecturers";
import { classesRoutes } from "./routes/classes";
import { sessionsRoutes } from "./routes/sessions";
import { checkinRoutes } from "./routes/checkin";

const DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const D1_BOOKMARK_HEADER = "x-d1-bookmark";

const app = new Hono<AppContext>();

// CORS — allow the admin portal dev origin(s); expose the bookmark header so
// clients can echo it back for read-after-write consistency.
app.use("*", (c, next) =>
  cors({
    origin: c.env.CORS_ORIGINS ? c.env.CORS_ORIGINS.split(",").map((s) => s.trim()) : DEFAULT_ORIGINS,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", D1_BOOKMARK_HEADER],
    exposeHeaders: [D1_BOOKMARK_HEADER],
    credentials: true,
  })(c, next),
);

// Standard error envelope: { error, details? } (SRS §6.1).
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const body: { error: string; details?: unknown } = { error: err.message };
    if (err.cause !== undefined) body.details = err.cause;
    return c.json(body, err.status);
  }
  console.error("unhandled_error", err);
  return c.json({ error: "internal_error" }, 500);
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

// Health check (unauthenticated).
app.get("/api/health", (c) => c.json({ ok: true, service: "tuition-api" }));

// Every route below uses a D1 Sessions-API session.
app.use("/api/*", dbSession);

app.route("/api/auth", authRoutes);
app.route("/api/setup", setupRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/roles", rolesRoutes);
app.route("/api/permissions", permissionsRoutes);
app.route("/api/students", studentsRoutes);
app.route("/api/lecturers", lecturersRoutes);
app.route("/api/classes", classesRoutes);
app.route("/api/sessions", sessionsRoutes);
app.route("/api/checkin", checkinRoutes);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    // TODO(M4/M5): route by _event.cron → invoice-gen / mark-overdue / dispatch-notifications
  },
};
