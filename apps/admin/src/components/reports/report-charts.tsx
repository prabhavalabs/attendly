import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AttendanceReportRow, RevenueReportRow } from "@tuition/shared";

import { formatLKR } from "@/lib/money";
import { BAND_VAR } from "@/components/classes/band";

const AXIS = {
  tick: { fill: "var(--ink-500)", fontSize: 12 },
  stroke: "var(--border)",
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card mb-4 rounded-2xl border p-5" style={{ boxShadow: "var(--sh-flat)" }}>
      <h3 className="font-display mb-4 text-sm font-semibold">{title}</h3>
      <div className="h-64 w-full">{children}</div>
    </div>
  );
}

/** Billed vs collected per period — grouped bars in LKR (major units). */
export function RevenueChart({ rows }: { rows: RevenueReportRow[] }) {
  if (rows.length === 0) return null;
  const data = [...rows]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((r) => ({
      period: r.period,
      Billed: r.billed_minor / 100,
      Collected: r.collected_minor / 100,
    }));
  return (
    <ChartCard title="Billed vs collected by month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tick={AXIS.tick} stroke={AXIS.stroke} tickLine={false} />
          <YAxis
            tick={AXIS.tick}
            stroke={AXIS.stroke}
            tickLine={false}
            width={64}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            formatter={(v) => formatLKR(Math.round(Number(v) * 100))}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Billed" fill="var(--neutral)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="Collected" fill="var(--ok)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Attendance rate (%) per class, coloured by class band. */
export function AttendanceChart({ rows }: { rows: AttendanceReportRow[] }) {
  const data = rows
    .filter((r) => r.rate != null)
    .map((r) => ({ code: r.code, band: r.band, rate: Math.round((r.rate ?? 0) * 100) }));
  if (data.length === 0) return null;
  return (
    <ChartCard title="Attendance rate by class">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="code" tick={AXIS.tick} stroke={AXIS.stroke} tickLine={false} />
          <YAxis
            tick={AXIS.tick}
            stroke={AXIS.stroke}
            tickLine={false}
            width={40}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            formatter={(v) => `${Number(v)}%`}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="rate" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={BAND_VAR[d.band]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
