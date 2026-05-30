import { Hono } from "hono";

/**
 * ClassDesk API — Cloudflare Worker (Hono).
 *
 * Scaffolding stub. To be fleshed out in M0 (Foundation):
 *   - CORS + dbSession middleware (echoes x-d1-bookmark for replica consistency)
 *   - auth (JWT verify) + requirePermission RBAC middleware
 *   - one route module per domain (students, checkin, billing, ...)
 *   - scheduled() handler routing cron events to invoice/overdue/notify jobs
 *
 * See SRS §6 (API spec) and §11.5 (API app build guide).
 */

export interface Env {
  DB: D1Database;
  ASSETS: R2Bucket;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, service: "tuition-api" }));

// TODO(M0): app.route("/api/auth", authRoutes)
// TODO(M0): app.route("/api/students", studentRoutes)
// TODO(M0): app.route("/api/checkin", checkinRoutes)

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    // TODO(M4/M5): route by _event.cron -> invoice-gen / mark-overdue / dispatch-notifications
  },
};
