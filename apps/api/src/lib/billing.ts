/**
 * Billing core (SRS §7.6): invoice generation, receipt numbering, status
 * recomputation, and overdue marking. Money is integer minor units.
 */
import type { Db } from "../types";
import { newId, nowIso } from "./id";

/** Today's date as YYYY-MM-DD (UTC). */
export function today(): string {
  return nowIso().slice(0, 10);
}

/**
 * Generate invoices for a period (YYYY-MM) from active enrollments of active
 * classes. Idempotent on (student_id, class_id, period). Returns count created.
 */
export async function generateInvoices(
  db: Db,
  opts: { period: string; dueDate?: string; classId?: string; actorId: string | null },
): Promise<number> {
  const dueDate = opts.dueDate ?? `${opts.period}-10`;
  const now = nowIso();

  const rows = await db
    .prepare(
      `SELECT e.student_id, e.class_id, COALESCE(e.fee_override_minor, c.fee_minor) AS amount
         FROM enrollments e
         JOIN classes c ON c.id = e.class_id AND c.deleted_at IS NULL AND c.status = 'active'
         JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
        WHERE e.status = 'active'${opts.classId ? " AND e.class_id = ?" : ""}`,
    )
    .bind(...(opts.classId ? [opts.classId] : []))
    .all<{ student_id: string; class_id: string; amount: number }>();

  const stmts: D1PreparedStatement[] = [];
  for (const r of rows.results ?? []) {
    if (r.amount <= 0) continue; // free classes don't bill
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO invoices (id, student_id, class_id, period, amount_minor, due_date, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .bind(newId("inv"), r.student_id, r.class_id, opts.period, r.amount, dueDate, now, now),
    );
  }
  if (stmts.length === 0) return 0;
  const results = await db.batch(stmts);
  return results.reduce((n, res) => n + (res.meta?.changes ?? 0), 0);
}

/** Sum of payments applied to an invoice. */
async function paidFor(db: Db, invoiceId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(SUM(amount_minor), 0) AS paid FROM payments WHERE invoice_id = ?`)
    .bind(invoiceId)
    .first<{ paid: number }>();
  return row?.paid ?? 0;
}

/** Recompute an invoice's derived status from its payments (waived is sticky). */
export async function recomputeInvoiceStatus(db: Db, invoiceId: string): Promise<void> {
  const inv = await db
    .prepare(`SELECT amount_minor, due_date, status FROM invoices WHERE id = ?`)
    .bind(invoiceId)
    .first<{ amount_minor: number; due_date: string; status: string }>();
  if (!inv || inv.status === "waived") return;

  const paid = await paidFor(db, invoiceId);
  let status: string;
  if (paid >= inv.amount_minor) status = "paid";
  else if (inv.due_date < today()) status = "overdue";
  else if (paid > 0) status = "partial";
  else status = "pending";

  await db.prepare(`UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?`).bind(status, nowIso(), invoiceId).run();
}

/** Mark unpaid/partial invoices overdue once past the due date. Returns count. */
export async function markOverdue(db: Db): Promise<number> {
  const res = await db
    .prepare(
      `UPDATE invoices SET status = 'overdue', updated_at = ?
        WHERE status IN ('pending', 'partial') AND due_date < ?`,
    )
    .bind(nowIso(), today())
    .run();
  return res.meta?.changes ?? 0;
}

/** Next sequential receipt number for the payment's month: RC-YYYYMM-NNNN. */
export async function nextReceiptNo(db: Db, paidAtIso: string): Promise<string> {
  const ym = paidAtIso.slice(0, 7).replace("-", ""); // YYYYMM
  const prefix = `RC-${ym}-`;
  const row = await db
    .prepare(`SELECT receipt_no FROM payments WHERE receipt_no LIKE ?1 ORDER BY receipt_no DESC LIMIT 1`)
    .bind(`${prefix}%`)
    .first<{ receipt_no: string }>();
  let next = 1;
  if (row) {
    const n = Number.parseInt(row.receipt_no.slice(prefix.length), 10);
    if (Number.isFinite(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}
