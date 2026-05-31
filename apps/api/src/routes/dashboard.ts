/** Dashboard summary (KPIs, today's sessions, defaulters, activity). */
import { Hono } from "hono";
import type { AppContext } from "../types";
import { authenticate } from "../middleware/auth";
import { computeDefaulters } from "../lib/billing";
import { nowIso } from "../lib/id";

export const dashboardRoutes = new Hono<AppContext>();
dashboardRoutes.use("*", authenticate);

dashboardRoutes.get("/", async (c) => {
  const db = c.get("db");
  const today = nowIso().slice(0, 10);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const active = await db.prepare(`SELECT COUNT(*) AS n FROM students WHERE status = 'active' AND deleted_at IS NULL`).first<{ n: number }>();
  const todayCount = await db.prepare(`SELECT COUNT(*) AS n FROM class_sessions WHERE session_date = ?`).bind(today).first<{ n: number }>();
  const outstanding = await db
    .prepare(
      `SELECT COALESCE(SUM(i.amount_minor - (SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.invoice_id = i.id)), 0) AS n
         FROM invoices i WHERE i.status IN ('pending', 'partial', 'overdue')`,
    )
    .first<{ n: number }>();

  const present = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM attendance a JOIN class_sessions cs ON cs.id = a.session_id
        WHERE cs.session_date >= ? AND a.status IN ('present', 'late')`,
    )
    .bind(since)
    .first<{ n: number }>();
  const expected = await db
    .prepare(
      `SELECT COALESCE(SUM((SELECT COUNT(*) FROM enrollments e WHERE e.class_id = cs.class_id AND e.status = 'active')), 0) AS n
         FROM class_sessions cs WHERE cs.session_date >= ? AND cs.session_date <= ? AND cs.status IN ('open', 'closed')`,
    )
    .bind(since, today)
    .first<{ n: number }>();
  const exp = expected?.n ?? 0;
  const attendance_rate = exp > 0 ? (present?.n ?? 0) / exp : null;

  const todaySessions = await db
    .prepare(
      `SELECT cs.id, c.name AS class_name, c.code, c.band, cs.start_time, cs.end_time, cs.status,
              (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = cs.class_id AND e.status = 'active') AS enrolled_count,
              (SELECT COUNT(*) FROM attendance a WHERE a.session_id = cs.id AND a.status IN ('present', 'late')) AS present_count
         FROM class_sessions cs JOIN classes c ON c.id = cs.class_id
        WHERE cs.session_date = ? ORDER BY cs.start_time`,
    )
    .bind(today)
    .all();

  const activity = await db
    .prepare(
      `SELECT a.id, a.action, a.entity_type, a.created_at, u.name AS actor_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT 8`,
    )
    .all();

  const defaulters = await computeDefaulters(db);

  return c.json({
    summary: {
      active_students: active?.n ?? 0,
      today_sessions: todayCount?.n ?? 0,
      outstanding_minor: outstanding?.n ?? 0,
      attendance_rate,
    },
    today: todaySessions.results ?? [],
    defaulters_top: defaulters.slice(0, 5),
    activity: activity.results ?? [],
  });
});
