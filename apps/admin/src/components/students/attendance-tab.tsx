import { CalendarCheck } from "lucide-react";
import { addDays, format, startOfToday, subDays } from "date-fns";

import { useStudentAttendance } from "@/hooks/use-students";
import { formatDate } from "@/lib/format";
import { StatusBadge, type StatusTone } from "@/components/common/status-badge";
import { Skeleton } from "@/components/ui/skeleton";

/** Heatmap code → swatch colour (matches the design's status language). */
const CODE_COLOR: Record<string, string> = {
  p: "var(--ok)",
  l: "var(--warn)",
  x: "var(--neutral)",
  a: "var(--bad)",
};
const CODE_LABEL: Record<string, string> = {
  p: "Present",
  l: "Late",
  x: "Excused",
  a: "Absent",
};
const LEGEND = ["p", "l", "x", "a"] as const;

const STATUS_TONE: Record<string, StatusTone> = {
  present: "ok",
  late: "warn",
  excused: "neutral",
  absent: "bad",
};

function Swatch({ code, date }: { code: string; date: Date }) {
  const color = CODE_COLOR[code];
  const status = code ? CODE_LABEL[code] : "No session";
  const label = `${format(date, "EEE, dd MMM yyyy")} — ${status}`;
  return (
    <div
      className="aspect-square rounded-[5px] border"
      title={label}
      style={
        color
          ? { background: color, borderColor: "transparent" }
          : { background: "var(--muted)", borderColor: "var(--border)" }
      }
      aria-label={label}
    />
  );
}

export function AttendanceTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useStudentAttendance(studentId);

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  const heatmap = data?.heatmap ?? [];
  const recent = data?.recent ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      {/* Heatmap — last 35 days, 7 columns per week */}
      <div className="bg-card rounded-2xl border p-5" style={{ boxShadow: "var(--sh-flat)" }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Last 35 days</h3>
          <div className="flex items-center gap-3">
            {LEGEND.map((c) => (
              <span key={c} className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span className="size-2.5 rounded-[3px]" style={{ background: CODE_COLOR[c] }} />
                {CODE_LABEL[c]}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {(() => {
            // The heatmap is `length` days ending today, oldest first.
            const firstDay = subDays(startOfToday(), heatmap.length - 1);
            return heatmap.map((code, i) => (
              <Swatch key={i} code={code} date={addDays(firstDay, i)} />
            ));
          })()}
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          One cell per day across this student's enrolled classes; the best status that day is shown.
        </p>
      </div>

      {/* Recent sessions */}
      <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
        <div className="border-b px-5 py-3">
          <h3 className="font-display text-sm font-semibold">Recent sessions</h3>
        </div>
        {recent.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
            <CalendarCheck className="size-6 opacity-50" />
            No sessions yet.
          </div>
        ) : (
          <ul className="divide-y">
            {recent.map((r, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.class_name}</div>
                  <div className="text-muted-foreground tnum text-xs">
                    {formatDate(r.session_date)} · {r.start_time}
                    {r.method ? ` · ${r.method}` : ""}
                  </div>
                </div>
                <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"} className="capitalize">
                  {r.status}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
