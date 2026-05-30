/** Reports (SRS §6.7, §7.9). Defaulters now; attendance/revenue in M7. */
import { Hono } from "hono";
import type { AppContext } from "../types";
import { authenticate, requirePermission } from "../middleware/auth";

export const reportsRoutes = new Hono<AppContext>();
reportsRoutes.use("*", authenticate);

/** GET /api/reports/defaulters — students with outstanding invoices. */
reportsRoutes.get("/defaulters", requirePermission("report.read"), async (c) => {
  const db = c.get("db");
  const rows = await db
    .prepare(
      `SELECT s.id, s.reg_no, s.full_name, s.phone, s.photo_url, s.status, s.card_status,
              i.period, i.amount_minor, i.status AS inv_status,
              (SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid
         FROM invoices i
         JOIN students s ON s.id = i.student_id AND s.deleted_at IS NULL
        WHERE i.status IN ('pending', 'partial', 'overdue')
        ORDER BY s.name_normalized`,
    )
    .all<Record<string, unknown>>();

  const byStudent = new Map<string, ReturnType<typeof newEntry>>();
  function newEntry(r: Record<string, unknown>) {
    return {
      student: {
        id: r.id as string,
        reg_no: r.reg_no as string,
        full_name: r.full_name as string,
        phone: (r.phone as string) ?? null,
        photo_url: (r.photo_url as string) ?? null,
        status: r.status as string,
        card_status: r.card_status as string,
      },
      outstanding_minor: 0,
      overdue_periods: [] as string[],
      invoice_count: 0,
    };
  }

  for (const r of rows.results ?? []) {
    const id = r.id as string;
    const entry = byStudent.get(id) ?? newEntry(r);
    const due = Number(r.amount_minor) - Number(r.paid);
    if (due > 0) entry.outstanding_minor += due;
    if (r.inv_status === "overdue") entry.overdue_periods.push(r.period as string);
    entry.invoice_count += 1;
    byStudent.set(id, entry);
  }

  const defaulters = [...byStudent.values()]
    .filter((d) => d.outstanding_minor > 0)
    .sort((a, b) => b.outstanding_minor - a.outstanding_minor);

  return c.json({ defaulters });
});
