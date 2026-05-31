/** Lecturer routes (SRS §6.5). Guarded by lecturer.read / lecturer.manage. */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createLecturerSchema, updateLecturerSchema } from "@tuition/shared";
import type { AppContext, Db } from "../types";
import { parseBody } from "../lib/validate";
import { newId, nowIso } from "../lib/id";
import { writeAudit } from "../lib/db";
import { authenticate, requirePermission } from "../middleware/auth";

async function getLecturer(db: Db, id: string) {
  return db
    .prepare(`SELECT id, name, phone, email, created_at FROM lecturers WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<{ id: string; name: string; phone: string | null; email: string | null; created_at: string }>();
}

export const lecturersRoutes = new Hono<AppContext>();
lecturersRoutes.use("*", authenticate);

/** GET /api/lecturers — list with active-class counts. */
lecturersRoutes.get("/", requirePermission("lecturer.read"), async (c) => {
  const db = c.get("db");
  const rows = await db
    .prepare(
      `SELECT l.id, l.name, l.phone, l.email, l.created_at,
              (SELECT COUNT(*) FROM classes c WHERE c.lecturer_id = l.id AND c.deleted_at IS NULL) AS class_count
         FROM lecturers l WHERE l.deleted_at IS NULL ORDER BY l.name`,
    )
    .all();
  return c.json({ lecturers: rows.results ?? [] });
});

lecturersRoutes.post("/", requirePermission("lecturer.manage"), async (c) => {
  const body = await parseBody(c, createLecturerSchema);
  const db = c.get("db");
  const id = newId("lec");
  const now = nowIso();
  await db
    .prepare(`INSERT INTO lecturers (id, name, phone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, body.name, body.phone ?? null, body.email ?? null, now, now)
    .run();
  await writeAudit(db, { actorId: c.get("user").id, action: "lecturer.create", entityType: "lecturer", entityId: id });
  return c.json({ ...(await getLecturer(db, id)), class_count: 0 }, 201);
});

lecturersRoutes.patch("/:id", requirePermission("lecturer.manage"), async (c) => {
  const body = await parseBody(c, updateLecturerSchema);
  const db = c.get("db");
  const id = c.req.param("id");
  if (!(await getLecturer(db, id))) throw new HTTPException(404, { message: "not_found" });

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.name !== undefined) { sets.push("name = ?"); binds.push(body.name); }
  if (body.phone !== undefined) { sets.push("phone = ?"); binds.push(body.phone ?? null); }
  if (body.email !== undefined) { sets.push("email = ?"); binds.push(body.email ?? null); }
  sets.push("updated_at = ?"); binds.push(nowIso());
  await db.prepare(`UPDATE lecturers SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  await writeAudit(db, { actorId: c.get("user").id, action: "lecturer.update", entityType: "lecturer", entityId: id });
  return c.json(await getLecturer(db, id));
});

lecturersRoutes.delete("/:id", requirePermission("lecturer.manage"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  if (!(await getLecturer(db, id))) throw new HTTPException(404, { message: "not_found" });
  const now = nowIso();
  await db.batch([
    db.prepare(`UPDATE lecturers SET deleted_at = ?, updated_at = ? WHERE id = ?`).bind(now, now, id),
    db.prepare(`UPDATE classes SET lecturer_id = NULL, updated_at = ? WHERE lecturer_id = ?`).bind(now, id),
  ]);
  await writeAudit(db, { actorId: c.get("user").id, action: "lecturer.delete", entityType: "lecturer", entityId: id });
  return c.json({ ok: true });
});
