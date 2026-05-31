/** Reports (SRS §6.7, §7.9): defaulters, attendance %, revenue, CSV export. */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { hasPermission, reportRangeQuerySchema } from "@tuition/shared";
import type { AppContext, Db } from "../types";
import { parseQuery } from "../lib/validate";
import { nowIso } from "../lib/id";
import { computeDefaulters } from "../lib/billing";
import { authenticate, requirePermission } from "../middleware/auth";

export const reportsRoutes = new Hono<AppContext>();
reportsRoutes.use("*", authenticate);

/* ------------------------------ CSV helpers ------------------------------ */

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function ensureCsvAllowed(c: { get: (k: "user") => { permissions: Set<string> } }): void {
  if (!hasPermission(c.get("user").permissions, "report.export")) {
    throw new HTTPException(403, { message: "forbidden" });
  }
}

function lkr(minor: number): string {
  return (minor / 100).toFixed(2);
}

function defaultRange(): { from: string; to: string } {
  const to = nowIso().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

/* ------------------------------ Defaulters ------------------------------- */

reportsRoutes.get("/defaulters", requirePermission("report.read"), async (c) => {
  const db = c.get("db");
  const defaulters = await computeDefaulters(db);
  if (c.req.query("format") === "csv") {
    ensureCsvAllowed(c);
    const csv = toCsv(
      ["reg_no", "name", "outstanding_lkr", "overdue_periods", "unpaid_invoices"],
      defaulters.map((d) => [d.student.reg_no, d.student.full_name, lkr(d.outstanding_minor), d.overdue_periods.join(" "), d.invoice_count]),
    );
    return csvResponse("defaulters.csv", csv);
  }
  return c.json({ defaulters });
});

/* --------------------------- Attendance report --------------------------- */

async function attendanceRows(db: Db, from: string, to: string) {
  const rows = await db
    .prepare(
      `SELECT c.id AS class_id, c.name AS class_name, c.code, c.band,
              (SELECT COUNT(*) FROM class_sessions cs WHERE cs.class_id = c.id AND cs.session_date BETWEEN ?1 AND ?2 AND cs.status IN ('open','closed')) AS sessions,
              (SELECT COUNT(*) FROM attendance a JOIN class_sessions cs ON cs.id = a.session_id
                 WHERE cs.class_id = c.id AND cs.session_date BETWEEN ?1 AND ?2 AND a.status IN ('present','late')) AS present,
              (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active') AS enrolled
         FROM classes c WHERE c.deleted_at IS NULL
        ORDER BY c.name`,
    )
    .bind(from, to)
    .all<{ class_id: string; class_name: string; code: string; band: string; sessions: number; present: number; enrolled: number }>();
  return (rows.results ?? []).map((r) => {
    const expected = r.sessions * r.enrolled;
    return {
      class_id: r.class_id,
      class_name: r.class_name,
      code: r.code,
      band: r.band,
      sessions: r.sessions,
      present: r.present,
      expected,
      rate: expected > 0 ? r.present / expected : null,
    };
  });
}

reportsRoutes.get("/attendance", requirePermission("report.read"), async (c) => {
  const { from, to, format } = parseQuery(c, reportRangeQuerySchema);
  const range = { from: from ?? defaultRange().from, to: to ?? defaultRange().to };
  const rows = await attendanceRows(c.get("db"), range.from, range.to);
  if (format === "csv") {
    ensureCsvAllowed(c);
    const csv = toCsv(
      ["class", "code", "sessions", "present", "expected", "rate_pct"],
      rows.map((r) => [r.class_name, r.code, r.sessions, r.present, r.expected, r.rate == null ? "" : (r.rate * 100).toFixed(1)]),
    );
    return csvResponse("attendance.csv", csv);
  }
  return c.json({ rows, from: range.from, to: range.to });
});

/* ----------------------------- Revenue report ---------------------------- */

async function revenueRows(db: Db) {
  const billed = await db
    .prepare(`SELECT period, SUM(CASE WHEN status != 'waived' THEN amount_minor ELSE 0 END) AS billed FROM invoices GROUP BY period`)
    .all<{ period: string; billed: number }>();
  const collected = await db
    .prepare(`SELECT i.period AS period, SUM(p.amount_minor) AS collected FROM payments p JOIN invoices i ON i.id = p.invoice_id GROUP BY i.period`)
    .all<{ period: string; collected: number }>();

  const map = new Map<string, { period: string; billed_minor: number; collected_minor: number }>();
  for (const b of billed.results ?? []) map.set(b.period, { period: b.period, billed_minor: b.billed ?? 0, collected_minor: 0 });
  for (const cc of collected.results ?? []) {
    const e = map.get(cc.period) ?? { period: cc.period, billed_minor: 0, collected_minor: 0 };
    e.collected_minor = cc.collected ?? 0;
    map.set(cc.period, e);
  }
  return [...map.values()].sort((a, b) => (a.period < b.period ? 1 : -1));
}

reportsRoutes.get("/revenue", requirePermission("report.read"), async (c) => {
  const { format } = parseQuery(c, reportRangeQuerySchema);
  const rows = await revenueRows(c.get("db"));
  if (format === "csv") {
    ensureCsvAllowed(c);
    const csv = toCsv(
      ["period", "billed_lkr", "collected_lkr"],
      rows.map((r) => [r.period, lkr(r.billed_minor), lkr(r.collected_minor)]),
    );
    return csvResponse("revenue.csv", csv);
  }
  return c.json({ rows });
});
