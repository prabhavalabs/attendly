/** Invoice & payment routes (SRS §6.6, §7.6). */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  generateInvoicesSchema,
  updateInvoiceSchema,
  invoiceListQuerySchema,
  createPaymentSchema,
} from "@tuition/shared";
import type { AppContext, Db } from "../types";
import { parseBody, parseQuery } from "../lib/validate";
import { newId, nowIso } from "../lib/id";
import { writeAudit } from "../lib/db";
import { generateInvoices, recomputeInvoiceStatus, nextReceiptNo } from "../lib/billing";
import { buildReceiptPdf } from "../lib/receipt-pdf";
import { authenticate, requirePermission } from "../middleware/auth";

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const INVOICE_SELECT = `
  SELECT i.id, i.student_id, s.full_name AS student_name, s.reg_no, s.photo_url,
         i.class_id, c.name AS class_name, c.code,
         i.period, i.amount_minor, i.due_date, i.status, i.waived_reason, i.created_at,
         (SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid_minor
    FROM invoices i
    JOIN students s ON s.id = i.student_id
    JOIN classes c ON c.id = i.class_id`;

function shapeInvoice(r: Record<string, unknown>) {
  const amount = Number(r.amount_minor);
  const paid = Number(r.paid_minor);
  return {
    id: r.id,
    student_id: r.student_id,
    student_name: r.student_name,
    reg_no: r.reg_no,
    class_id: r.class_id,
    class_name: r.class_name,
    code: r.code,
    period: r.period,
    amount_minor: amount,
    paid_minor: paid,
    outstanding_minor: amount - paid,
    due_date: r.due_date,
    status: r.status,
    waived_reason: r.waived_reason ?? null,
    created_at: r.created_at,
  };
}

async function getInvoiceShaped(db: Db, id: string) {
  const row = await db.prepare(`${INVOICE_SELECT} WHERE i.id = ?`).bind(id).first<Record<string, unknown>>();
  return row ? shapeInvoice(row) : null;
}

/* ------------------------------- Invoices -------------------------------- */

export const invoicesRoutes = new Hono<AppContext>();
invoicesRoutes.use("*", authenticate);

invoicesRoutes.get("/", requirePermission("invoice.read"), async (c) => {
  const { period, status, student_id, class_id } = parseQuery(c, invoiceListQuerySchema);
  const db = c.get("db");
  const where: string[] = [];
  const binds: unknown[] = [];
  if (period) { where.push("i.period = ?"); binds.push(period); }
  if (status) { where.push("i.status = ?"); binds.push(status); }
  if (student_id) { where.push("i.student_id = ?"); binds.push(student_id); }
  if (class_id) { where.push("i.class_id = ?"); binds.push(class_id); }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const rows = await db
    .prepare(`${INVOICE_SELECT}${whereSql} ORDER BY i.period DESC, s.name_normalized`)
    .bind(...binds)
    .all<Record<string, unknown>>();
  return c.json({ invoices: (rows.results ?? []).map(shapeInvoice) });
});

invoicesRoutes.post("/generate", requirePermission("invoice.manage"), async (c) => {
  const body = await parseBody(c, generateInvoicesSchema);
  const db = c.get("db");
  const created = await generateInvoices(db, {
    period: body.period,
    dueDate: body.due_date,
    classId: body.class_id,
    actorId: c.get("user").id,
  });
  await writeAudit(db, { actorId: c.get("user").id, action: "invoice.generate", entityType: "invoice", entityId: null, after: { period: body.period, created } });
  return c.json({ created });
});

invoicesRoutes.patch("/:id", requirePermission("invoice.manage"), async (c) => {
  const body = await parseBody(c, updateInvoiceSchema);
  const db = c.get("db");
  const id = c.req.param("id");
  const inv = await db.prepare(`SELECT id, status FROM invoices WHERE id = ?`).bind(id).first<{ id: string; status: string }>();
  if (!inv) throw new HTTPException(404, { message: "not_found" });

  if (body.waive) {
    await db
      .prepare(`UPDATE invoices SET status = 'waived', waived_reason = ?, updated_at = ? WHERE id = ?`)
      .bind(body.waived_reason ?? null, nowIso(), id)
      .run();
    await writeAudit(db, { actorId: c.get("user").id, action: "invoice.waive", entityType: "invoice", entityId: id, after: { reason: body.waived_reason } });
    return c.json(await getInvoiceShaped(db, id));
  }

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.amount_minor !== undefined) { sets.push("amount_minor = ?"); binds.push(body.amount_minor); }
  if (body.due_date !== undefined) { sets.push("due_date = ?"); binds.push(body.due_date); }
  if (sets.length > 0) {
    sets.push("updated_at = ?"); binds.push(nowIso());
    await db.prepare(`UPDATE invoices SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
    await recomputeInvoiceStatus(db, id);
    await writeAudit(db, { actorId: c.get("user").id, action: "invoice.update", entityType: "invoice", entityId: id, after: body });
  }
  return c.json(await getInvoiceShaped(db, id));
});

/* ------------------------------- Payments -------------------------------- */

export const paymentsRoutes = new Hono<AppContext>();
paymentsRoutes.use("*", authenticate);

paymentsRoutes.get("/", requirePermission("payment.read"), async (c) => {
  const db = c.get("db");
  const invoiceId = c.req.query("invoice_id");
  const studentId = c.req.query("student_id");
  const where: string[] = [];
  const binds: unknown[] = [];
  if (invoiceId) { where.push("invoice_id = ?"); binds.push(invoiceId); }
  if (studentId) { where.push("student_id = ?"); binds.push(studentId); }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const rows = await db
    .prepare(`SELECT id, invoice_id, student_id, amount_minor, method, receipt_no, note, paid_at FROM payments${whereSql} ORDER BY paid_at DESC`)
    .bind(...binds)
    .all();
  return c.json({ payments: rows.results ?? [] });
});

paymentsRoutes.post("/", requirePermission("payment.record"), async (c) => {
  const body = await parseBody(c, createPaymentSchema);
  const db = c.get("db");
  const invoice = await db
    .prepare(`SELECT id, student_id, status FROM invoices WHERE id = ?`)
    .bind(body.invoice_id)
    .first<{ id: string; student_id: string; status: string }>();
  if (!invoice) throw new HTTPException(404, { message: "invoice_not_found" });
  if (invoice.status === "waived") throw new HTTPException(400, { message: "invoice_waived" });

  const paidAt = body.paid_at ?? nowIso();
  const receiptNo = await nextReceiptNo(db, paidAt);
  const id = newId("pay");
  await db
    .prepare(
      `INSERT INTO payments (id, invoice_id, student_id, amount_minor, method, receipt_no, note, recorded_by, paid_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, invoice.id, invoice.student_id, body.amount_minor, body.method, receiptNo, body.note ?? null, c.get("user").id, paidAt, nowIso())
    .run();
  await recomputeInvoiceStatus(db, invoice.id);
  await writeAudit(db, { actorId: c.get("user").id, action: "payment.record", entityType: "payment", entityId: id, after: { invoice_id: invoice.id, amount_minor: body.amount_minor, receipt_no: receiptNo } });

  const payment = await db
    .prepare(`SELECT id, invoice_id, student_id, amount_minor, method, receipt_no, note, paid_at FROM payments WHERE id = ?`)
    .bind(id)
    .first();
  return c.json({ payment, invoice: await getInvoiceShaped(db, invoice.id) }, 201);
});

paymentsRoutes.get("/:id/receipt.pdf", requirePermission("payment.read"), async (c) => {
  const db = c.get("db");
  const row = await db
    .prepare(
      `SELECT p.receipt_no, p.amount_minor, p.method, p.paid_at,
              s.full_name, s.reg_no, c.name AS class_name, i.period
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         JOIN students s ON s.id = p.student_id
         JOIN classes c ON c.id = i.class_id
        WHERE p.id = ?`,
    )
    .bind(c.req.param("id"))
    .first<Record<string, string | number>>();
  if (!row) throw new HTTPException(404, { message: "not_found" });

  const orgRow = await db.prepare(`SELECT value FROM settings WHERE key = 'org_name'`).first<{ value: string }>();
  const pdf = await buildReceiptPdf({
    orgName: orgRow?.value ?? "attendly",
    receiptNo: String(row.receipt_no),
    paidAt: String(row.paid_at),
    studentName: String(row.full_name),
    regNo: String(row.reg_no),
    className: String(row.class_name),
    period: String(row.period),
    method: String(row.method),
    amountText: money.format(Number(row.amount_minor) / 100),
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${String(row.receipt_no)}.pdf"`,
    },
  });
});
