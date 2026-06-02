import { CalendarCheck } from "lucide-react";
import { addDays, format, getDay, startOfToday, subDays } from "date-fns";

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

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function DayCell({ code, date }: { code: string; date: Date }) {
  const color = CODE_COLOR[code];
  const status = code ? CODE_LABEL[code] : "No session";
  const label = `${format(date, "EEE, dd MMM yyyy")} — ${status}`;
  return (
    <div
      className="relative flex aspect-square items-center justify-center rounded-[6px] border"
      title={label}
      aria-label={label}
      style={
        color
          ? { background: color, borderColor: "transparent" }
          : { background: "var(--muted)", borderColor: "var(--border)" }
      }
    >
      <span
        className="text-[11px] leading-none font-semibold"
        style={{ color: color ? "rgba(255,255,255,0.95)" : "var(--ink-500)" }}
      >
        {format(date, "d")}
      </span>
    </div>
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
      {/* Heatmap — last 35 days as a weekday-aligned calendar */}
      <div className="bg-card rounded-2xl border p-5" style={{ boxShadow: "var(--sh-flat)" }}>
        {(() => {
          const today = startOfToday();
          const firstDay = subDays(today, Math.max(heatmap.length - 1, 0));
          // Pad the front so columns line up with weekdays (Sun … Sat).
          const cells: ({ code: string; date: Date } | null)[] = [
            ...Array(getDay(firstDay)).fill(null),
            ...heatmap.map((code, i) => ({ code, date: addDays(firstDay, i) })),
          ];
          while (cells.length % 7 !== 0) cells.push(null);
          return (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-semibold">Last 35 days</h3>
                  <p className="text-muted-foreground text-[11px]">
                    {format(firstDay, "d MMM")} – {format(today, "d MMM yyyy")}
                  </p>
                </div>
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
                {WEEKDAY_LETTERS.map((d, i) => (
                  <div key={`h${i}`} className="text-muted-foreground pb-0.5 text-center text-[10px] font-bold">
                    {d}
                  </div>
                ))}
                {cells.map((cell, i) =>
                  cell ? (
                    <DayCell key={i} code={cell.code} date={cell.date} />
                  ) : (
                    <div key={i} className="aspect-square" aria-hidden />
                  ),
                )}
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                One cell per day across this student's enrolled classes; the colour shows the best status that day.
              </p>
            </>
          );
        })()}
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
