/** Session routes (SRS §6.5, §7.5): generate, list, update, roster. */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { generateSessionsSchema, updateSessionSchema, sessionListQuerySchema } from "@tuition/shared";
import type { AppContext, Db } from "../types";
import { parseBody, parseQuery } from "../lib/validate";
import { newId, nowIso } from "../lib/id";
import { writeAudit } from "../lib/db";
import { syncSessionToCalendar } from "../lib/google";
import { authenticate, requirePermission } from "../middleware/auth";

const SESSION_SELECT = `
  SELECT cs.id, cs.class_id, c.name AS class_name, c.code, c.band,
         cs.session_date, cs.start_time, cs.end_time, cs.status, cs.topic,
         cs.substitute_lecturer_id, cs.created_at,
         (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = cs.class_id AND e.status = 'active') AS enrolled_count,
         (SELECT COUNT(*) FROM attendance a WHERE a.session_id = cs.id AND a.status IN ('present', 'late')) AS present_count
    FROM class_sessions cs
    JOIN classes c ON c.id = cs.class_id`;

const DAY_MS = 86_400_000;

async function getSession(db: Db, id: string) {
  return db.prepare(`${SESSION_SELECT} WHERE cs.id = ?`).bind(id).first();
}

export const sessionsRoutes = new Hono<AppContext>();
sessionsRoutes.use("*", authenticate);

/** POST /api/sessions/generate — materialize sessions from timetable slots. */
sessionsRoutes.post("/generate", requirePermission("session.manage"), async (c) => {
  const { class_id, from, to } = await parseBody(c, generateSessionsSchema);
  const db = c.get("db");

  const classRows = class_id
    ? await db.prepare(`SELECT id FROM classes WHERE id = ? AND deleted_at IS NULL AND status = 'active'`).bind(class_id).all<{ id: string }>()
    : await db.prepare(`SELECT id FROM classes WHERE deleted_at IS NULL AND status = 'active'`).all<{ id: string }>();
  const classes = classRows.results ?? [];
  if (classes.length === 0) return c.json({ created: 0, classes: 0 });

  const slotsByClass = new Map<string, { weekday: number; start_time: string; end_time: string }[]>();
  for (const cl of classes) {
    const slots = await db
      .prepare(`SELECT weekday, start_time, end_time FROM timetable_slots WHERE class_id = ? ORDER BY start_time`)
      .bind(cl.id)
      .all<{ weekday: number; start_time: string; end_time: string }>();
    slotsByClass.set(cl.id, slots.results ?? []);
  }

  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) throw new HTTPException(422, { message: "invalid_date" });
  if ((end - start) / DAY_MS > 366) throw new HTTPException(422, { message: "range_too_large" });

  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const d = new Date(t);
    const dateStr = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    for (const cl of classes) {
      const match = (slotsByClass.get(cl.id) ?? [])
        .filter((s) => s.weekday === wd)
        .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
      if (!match) continue;
      stmts.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO class_sessions (id, class_id, session_date, start_time, end_time, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
          )
          .bind(newId("ses"), cl.id, dateStr, match.start_time, match.end_time, now, now),
      );
    }
  }

  let created = 0;
  if (stmts.length > 0) {
    const results = await db.batch(stmts);
    created = results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  }
  await writeAudit(db, {
    actorId: c.get("user").id,
    action: "session.generate",
    entityType: "class",
    entityId: class_id ?? null,
    after: { from, to, created },
  });
  return c.json({ created, classes: classes.length });
});

/** GET /api/sessions?from=&to=&class_id=&status= */
sessionsRoutes.get("/", requirePermission("session.read"), async (c) => {
  const { from, to, class_id, status } = parseQuery(c, sessionListQuerySchema);
  const db = c.get("db");
  const where: string[] = [];
  const binds: unknown[] = [];
  if (from) { where.push("cs.session_date >= ?"); binds.push(from); }
  if (to) { where.push("cs.session_date <= ?"); binds.push(to); }
  if (class_id) { where.push("cs.class_id = ?"); binds.push(class_id); }
  if (status) { where.push("cs.status = ?"); binds.push(status); }
  const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
  const rows = await db
    .prepare(`${SESSION_SELECT}${whereSql} ORDER BY cs.session_date, cs.start_time`)
    .bind(...binds)
    .all();
  return c.json({ sessions: rows.results ?? [] });
});

/** GET /api/sessions/:id — single session. */
sessionsRoutes.get("/:id", requirePermission("session.read"), async (c) => {
  const session = await getSession(c.get("db"), c.req.param("id"));
  if (!session) throw new HTTPException(404, { message: "not_found" });
  return c.json(session);
});

/** GET /api/sessions/:id/roster — enrolled students + attendance state. */
sessionsRoutes.get("/:id/roster", requirePermission("session.read"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const session = await db.prepare(`SELECT id, class_id FROM class_sessions WHERE id = ?`).bind(id).first<{ id: string; class_id: string }>();
  if (!session) throw new HTTPException(404, { message: "not_found" });

  const rows = await db
    .prepare(
      `SELECT s.id, s.reg_no, s.full_name, s.phone, s.photo_url, s.status, s.card_status,
              a.status AS att_status, a.method, a.checked_in_at
         FROM enrollments e
         JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
         LEFT JOIN attendance a ON a.session_id = ? AND a.student_id = s.id
        WHERE e.class_id = ? AND e.status = 'active'
        ORDER BY s.name_normalized`,
    )
    .bind(id, session.class_id)
    .all<Record<string, unknown>>();

  const roster = (rows.results ?? []).map((r) => ({
    student: {
      id: r.id,
      reg_no: r.reg_no,
      full_name: r.full_name,
      phone: r.phone,
      photo_url: r.photo_url,
      status: r.status,
      card_status: r.card_status,
    },
    status: r.att_status ?? null,
    method: r.method ?? null,
    checked_in_at: r.checked_in_at ?? null,
  }));
  return c.json({ session: await getSession(db, id), roster });
});

/** DELETE /api/sessions/:id/attendance/:studentId — clear a student's mark. */
sessionsRoutes.delete("/:id/attendance/:studentId", requirePermission("attendance.record"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const studentId = c.req.param("studentId");
  await db.prepare(`DELETE FROM attendance WHERE session_id = ? AND student_id = ?`).bind(id, studentId).run();
  await writeAudit(db, { actorId: c.get("user").id, action: "attendance.clear", entityType: "session", entityId: id, after: { student_id: studentId } });
  return c.json({ ok: true });
});

/** PATCH /api/sessions/:id — open/close/cancel, set topic / substitute. */
sessionsRoutes.patch("/:id", requirePermission("session.manage"), async (c) => {
  const body = await parseBody(c, updateSessionSchema);
  const db = c.get("db");
  const id = c.req.param("id");
  const existing = await db.prepare(`SELECT id FROM class_sessions WHERE id = ?`).bind(id).first<{ id: string }>();
  if (!existing) throw new HTTPException(404, { message: "not_found" });

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.status !== undefined) { sets.push("status = ?"); binds.push(body.status); }
  if (body.topic !== undefined) { sets.push("topic = ?"); binds.push(body.topic ?? null); }
  if (body.substitute_lecturer_id !== undefined) { sets.push("substitute_lecturer_id = ?"); binds.push(body.substitute_lecturer_id ?? null); }
  sets.push("updated_at = ?"); binds.push(nowIso());
  await db.prepare(`UPDATE class_sessions SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  await writeAudit(db, { actorId: c.get("user").id, action: "session.update", entityType: "session", entityId: id, after: body });
  // Best-effort Google Calendar sync (no-op unless connected); never blocks.
  c.executionCtx.waitUntil(syncSessionToCalendar(db, c.env, id));
  return c.json(await getSession(db, id));
});
