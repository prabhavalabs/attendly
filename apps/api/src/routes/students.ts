/** Student & guardian routes (SRS §6.3, §7.2). Guarded by student.* permissions. */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createStudentSchema,
  updateStudentSchema,
  createGuardianSchema,
  updateGuardianSchema,
  studentListQuerySchema,
  type CreateGuardianInput,
} from "@tuition/shared";
import type { AppContext, Db } from "../types";
import { parseBody, parseQuery } from "../lib/validate";
import { newId, nowIso } from "../lib/id";
import { randomToken } from "../lib/crypto";
import { normalizeName, likeEscape } from "../lib/text";
import { writeAudit } from "../lib/db";
import { buildCardPdf } from "../lib/card-pdf";
import { authenticate, requirePermission } from "../middleware/auth";

const STUDENT_COLS = `id, reg_no, full_name, phone, email, photo_url, card_token,
  card_status, card_issued_at, status, date_of_birth, address, notes,
  created_at, updated_at`;

interface StudentRow {
  id: string; reg_no: string; full_name: string; phone: string | null; email: string | null;
  photo_url: string | null; card_token: string; card_status: string; card_issued_at: string | null;
  status: string; date_of_birth: string | null; address: string | null; notes: string | null;
  created_at: string; updated_at: string;
}

/** Next reg_no for the current year: YYYY-NNNN (max across all rows, incl. deleted). */
async function nextRegNo(db: Db): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `${year}-`;
  const row = await db
    .prepare(`SELECT reg_no FROM students WHERE reg_no LIKE ?1 ORDER BY reg_no DESC LIMIT 1`)
    .bind(`${prefix}%`)
    .first<{ reg_no: string }>();
  let next = 1;
  if (row) {
    const n = Number.parseInt(row.reg_no.slice(prefix.length), 10);
    if (Number.isFinite(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

async function guardiansForStudent(db: Db, studentId: string) {
  const rows = await db
    .prepare(
      `SELECT g.id, g.name, g.phone, g.email, sg.relationship, sg.is_primary
         FROM guardians g
         JOIN student_guardians sg ON sg.guardian_id = g.id
        WHERE sg.student_id = ?
        ORDER BY sg.is_primary DESC, g.name`,
    )
    .bind(studentId)
    .all<{ id: string; name: string; phone: string; email: string | null; relationship: string; is_primary: number }>();
  return (rows.results ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    phone: g.phone,
    email: g.email,
    relationship: g.relationship as CreateGuardianInput["relationship"],
    is_primary: g.is_primary === 1,
  }));
}

async function getStudentRow(db: Db, id: string): Promise<StudentRow | null> {
  return db
    .prepare(`SELECT ${STUDENT_COLS} FROM students WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<StudentRow>();
}

async function insertGuardian(db: Db, studentId: string, g: CreateGuardianInput): Promise<void> {
  const gid = newId("grd");
  const now = nowIso();
  await db.batch([
    ...(g.is_primary
      ? [db.prepare(`UPDATE student_guardians SET is_primary = 0 WHERE student_id = ?`).bind(studentId)]
      : []),
    db
      .prepare(`INSERT INTO guardians (id, name, phone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(gid, g.name, g.phone, g.email ?? null, now, now),
    db
      .prepare(
        `INSERT INTO student_guardians (student_id, guardian_id, relationship, is_primary)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(studentId, gid, g.relationship, g.is_primary ? 1 : 0),
  ]);
}

export const studentsRoutes = new Hono<AppContext>();
studentsRoutes.use("*", authenticate);

/** GET /api/students — paginated list with text search + status filter. */
studentsRoutes.get("/", requirePermission("student.read"), async (c) => {
  const { q, status, page, page_size } = parseQuery(c, studentListQuerySchema);
  const db = c.get("db");

  const where: string[] = ["deleted_at IS NULL"];
  const binds: unknown[] = [];
  if (status) {
    where.push("status = ?");
    binds.push(status);
  }
  if (q && q.length > 0) {
    const like = `%${likeEscape(q)}%`;
    const nameLike = `%${likeEscape(normalizeName(q))}%`;
    where.push(`(name_normalized LIKE ? ESCAPE '\\' OR reg_no LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')`);
    binds.push(nameLike, like, like);
  }
  const whereSql = where.join(" AND ");

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM students WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();

  const rows = await db
    .prepare(
      `SELECT id, reg_no, full_name, phone, photo_url, status, card_status
         FROM students WHERE ${whereSql}
        ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, page_size, (page - 1) * page_size)
    .all();

  return c.json({
    students: rows.results ?? [],
    total: totalRow?.n ?? 0,
    page,
    page_size,
  });
});

/** GET /api/students/search?q= — typeahead (name / reg_no / phone). */
studentsRoutes.get("/search", requirePermission("student.read"), async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const db = c.get("db");
  if (!q) return c.json({ students: [] });
  const like = `%${likeEscape(q)}%`;
  const nameLike = `%${likeEscape(normalizeName(q))}%`;
  const rows = await db
    .prepare(
      `SELECT id, reg_no, full_name, phone, photo_url, status, card_status
         FROM students
        WHERE deleted_at IS NULL
          AND (name_normalized LIKE ? ESCAPE '\\' OR reg_no LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')
        ORDER BY name_normalized LIMIT 10`,
    )
    .bind(nameLike, like, like)
    .all();
  return c.json({ students: rows.results ?? [] });
});

/** GET /api/students/:id — detail + guardians. */
studentsRoutes.get("/:id", requirePermission("student.read"), async (c) => {
  const db = c.get("db");
  const row = await getStudentRow(db, c.req.param("id"));
  if (!row) throw new HTTPException(404, { message: "not_found" });
  return c.json({ ...row, guardians: await guardiansForStudent(db, row.id) });
});

/** POST /api/students — create (auto reg_no + card_token), with optional guardians. */
studentsRoutes.post("/", requirePermission("student.create"), async (c) => {
  const body = await parseBody(c, createStudentSchema);
  const db = c.get("db");

  const id = newId("stu");
  const regNo = await nextRegNo(db);
  const cardToken = randomToken(16); // 128-bit opaque token
  const now = nowIso();

  await db
    .prepare(
      `INSERT INTO students
         (id, reg_no, full_name, name_normalized, phone, email, card_token,
          card_status, card_issued_at, status, date_of_birth, address, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, regNo, body.full_name, normalizeName(body.full_name), body.phone ?? null, body.email ?? null,
      cardToken, now, body.status, body.date_of_birth ?? null, body.address ?? null, body.notes ?? null, now, now,
    )
    .run();

  for (const g of body.guardians) await insertGuardian(db, id, g);

  await writeAudit(db, {
    actorId: c.get("user").id,
    action: "student.create",
    entityType: "student",
    entityId: id,
    after: { reg_no: regNo, full_name: body.full_name },
  });

  const row = await getStudentRow(db, id);
  return c.json({ ...row, guardians: await guardiansForStudent(db, id) }, 201);
});

/** PATCH /api/students/:id — update profile fields. */
studentsRoutes.patch("/:id", requirePermission("student.update"), async (c) => {
  const body = await parseBody(c, updateStudentSchema);
  const db = c.get("db");
  const id = c.req.param("id");
  const existing = await getStudentRow(db, id);
  if (!existing) throw new HTTPException(404, { message: "not_found" });

  const sets: string[] = [];
  const binds: unknown[] = [];
  const setField = (col: string, val: unknown) => { sets.push(`${col} = ?`); binds.push(val); };

  if (body.full_name !== undefined) {
    setField("full_name", body.full_name);
    setField("name_normalized", normalizeName(body.full_name));
  }
  if (body.phone !== undefined) setField("phone", body.phone);
  if (body.email !== undefined) setField("email", body.email);
  if (body.date_of_birth !== undefined) setField("date_of_birth", body.date_of_birth);
  if (body.address !== undefined) setField("address", body.address);
  if (body.notes !== undefined) setField("notes", body.notes);
  if (body.status !== undefined) setField("status", body.status);
  setField("updated_at", nowIso());

  await db.prepare(`UPDATE students SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  await writeAudit(db, { actorId: c.get("user").id, action: "student.update", entityType: "student", entityId: id, after: body });

  const row = await getStudentRow(db, id);
  return c.json({ ...row, guardians: await guardiansForStudent(db, id) });
});

/** DELETE /api/students/:id — soft delete (preserves history, SRS FR-2.5). */
studentsRoutes.delete("/:id", requirePermission("student.delete"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const existing = await getStudentRow(db, id);
  if (!existing) throw new HTTPException(404, { message: "not_found" });
  const now = nowIso();
  await db.prepare(`UPDATE students SET deleted_at = ?, updated_at = ? WHERE id = ?`).bind(now, now, id).run();
  await writeAudit(db, { actorId: c.get("user").id, action: "student.delete", entityType: "student", entityId: id });
  return c.json({ ok: true });
});

/* -------------------------------- Cards ---------------------------------- */

/** POST /api/students/:id/card/issue — (re)issue: mint a new token, activate. */
studentsRoutes.post("/:id/card/issue", requirePermission("card.issue"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const existing = await getStudentRow(db, id);
  if (!existing) throw new HTTPException(404, { message: "not_found" });

  const token = randomToken(16);
  const now = nowIso();
  await db
    .prepare(
      `UPDATE students SET card_token = ?, card_status = 'active', card_issued_at = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(token, now, now, id)
    .run();
  await writeAudit(db, { actorId: c.get("user").id, action: "card.issue", entityType: "student", entityId: id });

  const row = await getStudentRow(db, id);
  return c.json({ ...row, guardians: await guardiansForStudent(db, id) });
});

/** POST /api/students/:id/card/revoke — mark the card revoked (or lost). */
studentsRoutes.post("/:id/card/revoke", requirePermission("card.revoke"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const existing = await getStudentRow(db, id);
  if (!existing) throw new HTTPException(404, { message: "not_found" });

  let status: "revoked" | "lost" = "revoked";
  try {
    const body = (await c.req.json()) as { status?: string };
    if (body?.status === "lost") status = "lost";
  } catch {
    /* empty body is fine */
  }
  const now = nowIso();
  await db.prepare(`UPDATE students SET card_status = ?, updated_at = ? WHERE id = ?`).bind(status, now, id).run();
  await writeAudit(db, { actorId: c.get("user").id, action: "card.revoke", entityType: "student", entityId: id, after: { card_status: status } });

  const row = await getStudentRow(db, id);
  return c.json({ ...row, guardians: await guardiansForStudent(db, id) });
});

/** GET /api/students/:id/card.pdf — printable ID card with QR of the token. */
studentsRoutes.get("/:id/card.pdf", requirePermission("card.issue"), async (c) => {
  const db = c.get("db");
  const row = await getStudentRow(db, c.req.param("id"));
  if (!row) throw new HTTPException(404, { message: "not_found" });

  const orgRow = await db.prepare(`SELECT value FROM settings WHERE key = 'org_name'`).first<{ value: string }>();
  const subtitle = row.status === "active" ? `Batch ${new Date(row.created_at).getUTCFullYear()}` : row.status;
  const pdf = await buildCardPdf({
    orgName: orgRow?.value ?? "attendly",
    fullName: row.full_name,
    regNo: row.reg_no,
    subtitle,
    cardToken: row.card_token,
    active: row.card_status === "active",
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="card-${row.reg_no}.pdf"`,
    },
  });
});

/* ------------------------------ Guardians -------------------------------- */

async function requireStudent(db: Db, id: string): Promise<void> {
  const row = await db.prepare(`SELECT id FROM students WHERE id = ? AND deleted_at IS NULL`).bind(id).first<{ id: string }>();
  if (!row) throw new HTTPException(404, { message: "not_found" });
}

/** POST /api/students/:id/guardians — add a guardian. */
studentsRoutes.post("/:id/guardians", requirePermission("student.update"), async (c) => {
  const body = await parseBody(c, createGuardianSchema);
  const db = c.get("db");
  const id = c.req.param("id");
  await requireStudent(db, id);
  await insertGuardian(db, id, body);
  await writeAudit(db, { actorId: c.get("user").id, action: "guardian.add", entityType: "student", entityId: id, after: { name: body.name } });
  return c.json({ guardians: await guardiansForStudent(db, id) }, 201);
});

/** PATCH /api/students/:id/guardians/:gid — edit a guardian + link. */
studentsRoutes.patch("/:id/guardians/:gid", requirePermission("student.update"), async (c) => {
  const body = await parseBody(c, updateGuardianSchema);
  const db = c.get("db");
  const id = c.req.param("id");
  const gid = c.req.param("gid");
  await requireStudent(db, id);

  const link = await db
    .prepare(`SELECT student_id FROM student_guardians WHERE student_id = ? AND guardian_id = ?`)
    .bind(id, gid)
    .first<{ student_id: string }>();
  if (!link) throw new HTTPException(404, { message: "guardian_not_found" });

  const stmts: D1PreparedStatement[] = [];
  const gSets: string[] = [];
  const gBinds: unknown[] = [];
  if (body.name !== undefined) { gSets.push("name = ?"); gBinds.push(body.name); }
  if (body.phone !== undefined) { gSets.push("phone = ?"); gBinds.push(body.phone); }
  if (body.email !== undefined) { gSets.push("email = ?"); gBinds.push(body.email ?? null); }
  if (gSets.length > 0) {
    gSets.push("updated_at = ?"); gBinds.push(nowIso());
    stmts.push(db.prepare(`UPDATE guardians SET ${gSets.join(", ")} WHERE id = ?`).bind(...gBinds, gid));
  }
  if (body.is_primary === true) {
    stmts.push(db.prepare(`UPDATE student_guardians SET is_primary = 0 WHERE student_id = ?`).bind(id));
  }
  if (body.relationship !== undefined || body.is_primary !== undefined) {
    const lSets: string[] = [];
    const lBinds: unknown[] = [];
    if (body.relationship !== undefined) { lSets.push("relationship = ?"); lBinds.push(body.relationship); }
    if (body.is_primary !== undefined) { lSets.push("is_primary = ?"); lBinds.push(body.is_primary ? 1 : 0); }
    stmts.push(
      db.prepare(`UPDATE student_guardians SET ${lSets.join(", ")} WHERE student_id = ? AND guardian_id = ?`).bind(...lBinds, id, gid),
    );
  }
  if (stmts.length > 0) await db.batch(stmts);
  return c.json({ guardians: await guardiansForStudent(db, id) });
});

/** DELETE /api/students/:id/guardians/:gid — unlink (and remove orphaned guardian). */
studentsRoutes.delete("/:id/guardians/:gid", requirePermission("student.update"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const gid = c.req.param("gid");
  await db.prepare(`DELETE FROM student_guardians WHERE student_id = ? AND guardian_id = ?`).bind(id, gid).run();
  const others = await db
    .prepare(`SELECT COUNT(*) AS n FROM student_guardians WHERE guardian_id = ?`)
    .bind(gid)
    .first<{ n: number }>();
  if ((others?.n ?? 0) === 0) {
    await db.prepare(`DELETE FROM guardians WHERE id = ?`).bind(gid).run();
  }
  await writeAudit(db, { actorId: c.get("user").id, action: "guardian.remove", entityType: "student", entityId: id });
  return c.json({ guardians: await guardiansForStudent(db, id) });
});
