/** Class, enrollment & timetable routes (SRS §6.5, §7.5). */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createClassSchema,
  updateClassSchema,
  createEnrollmentSchema,
  updateEnrollmentSchema,
  createTimetableSlotSchema,
} from "@tuition/shared";
import type { AppContext, Db } from "../types";
import { parseBody } from "../lib/validate";
import { newId, nowIso } from "../lib/id";
import { writeAudit } from "../lib/db";
import { authenticate, requirePermission } from "../middleware/auth";

const CLASS_SELECT = `
  SELECT c.id, c.name, c.subject, c.code, c.band, c.fee_minor, c.capacity, c.room,
         c.lecturer_id, l.name AS lecturer_name, c.status, c.created_at, c.updated_at,
         (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active') AS enrolled_count
    FROM classes c
    LEFT JOIN lecturers l ON l.id = c.lecturer_id AND l.deleted_at IS NULL`;

async function getClass(db: Db, id: string) {
  return db.prepare(`${CLASS_SELECT} WHERE c.id = ? AND c.deleted_at IS NULL`).bind(id).first();
}

async function requireClass(db: Db, id: string): Promise<void> {
  const row = await db.prepare(`SELECT id FROM classes WHERE id = ? AND deleted_at IS NULL`).bind(id).first<{ id: string }>();
  if (!row) throw new HTTPException(404, { message: "not_found" });
}

export const classesRoutes = new Hono<AppContext>();
classesRoutes.use("*", authenticate);

/* -------------------------------- Classes -------------------------------- */

classesRoutes.get("/", requirePermission("class.read"), async (c) => {
  const db = c.get("db");
  const status = c.req.query("status");
  const where = status === "active" || status === "archived" ? ` WHERE c.deleted_at IS NULL AND c.status = ?` : ` WHERE c.deleted_at IS NULL`;
  const stmt = db.prepare(`${CLASS_SELECT}${where} ORDER BY c.status, c.name`);
  const rows = await (status === "active" || status === "archived" ? stmt.bind(status) : stmt).all();
  return c.json({ classes: rows.results ?? [] });
});

classesRoutes.get("/:id", requirePermission("class.read"), async (c) => {
  const db = c.get("db");
  const cls = await getClass(db, c.req.param("id"));
  if (!cls) throw new HTTPException(404, { message: "not_found" });
  const slots = await db
    .prepare(`SELECT id, class_id, weekday, start_time, end_time, room FROM timetable_slots WHERE class_id = ? ORDER BY weekday, start_time`)
    .bind(c.req.param("id"))
    .all();
  return c.json({ ...cls, timetable: slots.results ?? [] });
});

classesRoutes.post("/", requirePermission("class.manage"), async (c) => {
  const body = await parseBody(c, createClassSchema);
  const db = c.get("db");
  const id = newId("cls");
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO classes (id, name, subject, code, band, fee_minor, capacity, room, lecturer_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .bind(id, body.name, body.subject, body.code, body.band, body.fee_minor, body.capacity ?? null, body.room ?? null, body.lecturer_id ?? null, now, now)
    .run();
  await writeAudit(db, { actorId: c.get("user").id, action: "class.create", entityType: "class", entityId: id, after: { name: body.name } });
  return c.json(await getClass(db, id), 201);
});

classesRoutes.patch("/:id", requirePermission("class.manage"), async (c) => {
  const body = await parseBody(c, updateClassSchema);
  const db = c.get("db");
  const id = c.req.param("id");
  await requireClass(db, id);

  const sets: string[] = [];
  const binds: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); binds.push(v); };
  if (body.name !== undefined) set("name", body.name);
  if (body.subject !== undefined) set("subject", body.subject);
  if (body.code !== undefined) set("code", body.code);
  if (body.band !== undefined) set("band", body.band);
  if (body.fee_minor !== undefined) set("fee_minor", body.fee_minor);
  if (body.capacity !== undefined) set("capacity", body.capacity ?? null);
  if (body.room !== undefined) set("room", body.room ?? null);
  if (body.lecturer_id !== undefined) set("lecturer_id", body.lecturer_id ?? null);
  if (body.status !== undefined) set("status", body.status);
  set("updated_at", nowIso());
  await db.prepare(`UPDATE classes SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  await writeAudit(db, { actorId: c.get("user").id, action: "class.update", entityType: "class", entityId: id, after: body });
  return c.json(await getClass(db, id));
});

classesRoutes.delete("/:id", requirePermission("class.manage"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await requireClass(db, id);
  const now = nowIso();
  await db.prepare(`UPDATE classes SET deleted_at = ?, updated_at = ? WHERE id = ?`).bind(now, now, id).run();
  await writeAudit(db, { actorId: c.get("user").id, action: "class.delete", entityType: "class", entityId: id });
  return c.json({ ok: true });
});

/* ------------------------------ Enrollments ------------------------------ */

async function enrollmentsFor(db: Db, classId: string) {
  const rows = await db
    .prepare(
      `SELECT e.id, e.class_id, e.status, e.fee_override_minor, e.enrolled_at,
              COALESCE(e.fee_override_minor, c.fee_minor) AS effective_fee_minor,
              s.id AS s_id, s.reg_no, s.full_name, s.phone, s.photo_url, s.status AS s_status, s.card_status
         FROM enrollments e
         JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
         JOIN classes c ON c.id = e.class_id
        WHERE e.class_id = ?
        ORDER BY e.status, s.name_normalized`,
    )
    .bind(classId)
    .all<Record<string, unknown>>();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    class_id: r.class_id,
    status: r.status,
    fee_override_minor: r.fee_override_minor,
    effective_fee_minor: r.effective_fee_minor,
    enrolled_at: r.enrolled_at,
    student: {
      id: r.s_id,
      reg_no: r.reg_no,
      full_name: r.full_name,
      phone: r.phone,
      photo_url: r.photo_url,
      status: r.s_status,
      card_status: r.card_status,
    },
  }));
}

classesRoutes.get("/:id/enrollments", requirePermission("class.read"), async (c) => {
  const db = c.get("db");
  await requireClass(db, c.req.param("id"));
  return c.json({ enrollments: await enrollmentsFor(db, c.req.param("id")) });
});

classesRoutes.post("/:id/enrollments", requirePermission("class.manage"), async (c) => {
  const body = await parseBody(c, createEnrollmentSchema);
  const db = c.get("db");
  const classId = c.req.param("id");
  const cls = await db.prepare(`SELECT id, capacity FROM classes WHERE id = ? AND deleted_at IS NULL`).bind(classId).first<{ id: string; capacity: number | null }>();
  if (!cls) throw new HTTPException(404, { message: "not_found" });

  const student = await db.prepare(`SELECT id FROM students WHERE id = ? AND deleted_at IS NULL`).bind(body.student_id).first<{ id: string }>();
  if (!student) throw new HTTPException(422, { message: "unknown_student" });

  const existing = await db
    .prepare(`SELECT id, status FROM enrollments WHERE student_id = ? AND class_id = ?`)
    .bind(body.student_id, classId)
    .first<{ id: string; status: string }>();
  if (existing && existing.status === "active") throw new HTTPException(409, { message: "already_enrolled" });

  if (cls.capacity != null) {
    const count = await db.prepare(`SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ? AND status = 'active'`).bind(classId).first<{ n: number }>();
    if ((count?.n ?? 0) >= cls.capacity) throw new HTTPException(409, { message: "class_full" });
  }

  const now = nowIso();
  if (existing) {
    await db.prepare(`UPDATE enrollments SET status = 'active', fee_override_minor = ?, enrolled_at = ? WHERE id = ?`).bind(body.fee_override_minor ?? null, now, existing.id).run();
  } else {
    await db
      .prepare(`INSERT INTO enrollments (id, student_id, class_id, fee_override_minor, status, enrolled_at) VALUES (?, ?, ?, ?, 'active', ?)`)
      .bind(newId("enr"), body.student_id, classId, body.fee_override_minor ?? null, now)
      .run();
  }
  await writeAudit(db, { actorId: c.get("user").id, action: "enrollment.add", entityType: "class", entityId: classId, after: { student_id: body.student_id } });
  return c.json({ enrollments: await enrollmentsFor(db, classId) }, 201);
});

classesRoutes.patch("/:id/enrollments/:eid", requirePermission("class.manage"), async (c) => {
  const body = await parseBody(c, updateEnrollmentSchema);
  const db = c.get("db");
  const classId = c.req.param("id");
  const eid = c.req.param("eid");
  const existing = await db
    .prepare(`SELECT id FROM enrollments WHERE id = ? AND class_id = ?`)
    .bind(eid, classId)
    .first<{ id: string }>();
  if (!existing) throw new HTTPException(404, { message: "not_found" });

  const sets: string[] = [];
  const binds: unknown[] = [];
  if ("fee_override_minor" in body) { sets.push("fee_override_minor = ?"); binds.push(body.fee_override_minor ?? null); }
  if (body.status !== undefined) { sets.push("status = ?"); binds.push(body.status); }
  if (sets.length > 0) {
    await db.prepare(`UPDATE enrollments SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, eid).run();
    await writeAudit(db, { actorId: c.get("user").id, action: "enrollment.update", entityType: "class", entityId: classId, after: body });
  }
  return c.json({ enrollments: await enrollmentsFor(db, classId) });
});

classesRoutes.delete("/:id/enrollments/:eid", requirePermission("class.manage"), async (c) => {
  const db = c.get("db");
  const classId = c.req.param("id");
  await db.prepare(`DELETE FROM enrollments WHERE id = ? AND class_id = ?`).bind(c.req.param("eid"), classId).run();
  await writeAudit(db, { actorId: c.get("user").id, action: "enrollment.remove", entityType: "class", entityId: classId });
  return c.json({ enrollments: await enrollmentsFor(db, classId) });
});

/* ------------------------------- Timetable ------------------------------- */

classesRoutes.get("/:id/timetable", requirePermission("timetable.read"), async (c) => {
  const db = c.get("db");
  await requireClass(db, c.req.param("id"));
  const rows = await db
    .prepare(`SELECT id, class_id, weekday, start_time, end_time, room FROM timetable_slots WHERE class_id = ? ORDER BY weekday, start_time`)
    .bind(c.req.param("id"))
    .all();
  return c.json({ timetable: rows.results ?? [] });
});

classesRoutes.post("/:id/timetable", requirePermission("timetable.manage"), async (c) => {
  const body = await parseBody(c, createTimetableSlotSchema);
  const db = c.get("db");
  const classId = c.req.param("id");
  await requireClass(db, classId);
  await db
    .prepare(`INSERT INTO timetable_slots (id, class_id, weekday, start_time, end_time, room, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(newId("tts"), classId, body.weekday, body.start_time, body.end_time, body.room ?? null, nowIso())
    .run();
  await writeAudit(db, { actorId: c.get("user").id, action: "timetable.add", entityType: "class", entityId: classId });
  const rows = await db.prepare(`SELECT id, class_id, weekday, start_time, end_time, room FROM timetable_slots WHERE class_id = ? ORDER BY weekday, start_time`).bind(classId).all();
  return c.json({ timetable: rows.results ?? [] }, 201);
});

classesRoutes.delete("/:id/timetable/:slotId", requirePermission("timetable.manage"), async (c) => {
  const db = c.get("db");
  const classId = c.req.param("id");
  await db.prepare(`DELETE FROM timetable_slots WHERE id = ? AND class_id = ?`).bind(c.req.param("slotId"), classId).run();
  const rows = await db.prepare(`SELECT id, class_id, weekday, start_time, end_time, room FROM timetable_slots WHERE class_id = ? ORDER BY weekday, start_time`).bind(classId).all();
  return c.json({ timetable: rows.results ?? [] });
});
