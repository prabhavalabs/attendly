import { useNavigate } from "@tanstack/react-router";
import { CalendarCheck, AlertTriangle, Activity } from "lucide-react";
import type { SessionStatus } from "@tuition/shared";

import { useAuthStore } from "@/lib/auth-store";
import { useDashboard } from "@/hooks/use-dashboard";
import { formatLKR } from "@/lib/money";
import { timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/common/page-header";
import { ClassChip } from "@/components/classes/band";
import { SessionStatusBadge } from "@/components/sessions/session-status";
import { Skeleton } from "@/components/ui/skeleton";

function humanizeAction(action: string): string {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name.split(" ")[0] ?? "there";
  const { data, isLoading } = useDashboard();

  const s = data?.summary;
  const kpis = [
    { label: "Active students", value: s ? String(s.active_students) : "—", sub: "Enrolled this term", accent: "var(--brand-500)" },
    { label: "Today's sessions", value: s ? String(s.today_sessions) : "—", sub: "Across all classes", accent: "var(--band-blue)" },
    { label: "Outstanding fees", value: s ? formatLKR(s.outstanding_minor) : "—", sub: "Awaiting collection", accent: "var(--warn)" },
    {
      label: "Attendance rate",
      value: s ? (s.attendance_rate == null ? "—" : `${Math.round(s.attendance_rate * 100)}%`) : "—",
      sub: "Rolling 30 days",
      accent: "var(--ok)",
    },
  ];

  return (
    <div className="p-6 md:p-8">
      <PageHeader title={`Welcome back, ${firstName}`} description="Here's the shape of your class at a glance." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-card relative overflow-hidden rounded-2xl border p-5" style={{ boxShadow: "var(--sh-flat)" }}>
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: kpi.accent }} aria-hidden />
            <div className="text-muted-foreground text-sm font-semibold">{kpi.label}</div>
            <div className="text-foreground font-display tnum mt-3 text-3xl font-extrabold tracking-tight">
              {isLoading ? <Skeleton className="h-8 w-20" /> : kpi.value}
            </div>
            <div className="text-muted-foreground mt-2 text-xs">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Today's sessions */}
        <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
          <div className="flex items-center gap-2 border-b px-5 py-3.5">
            <CalendarCheck className="text-muted-foreground size-4" />
            <h3 className="font-display text-sm font-bold">Today's sessions</h3>
          </div>
          {isLoading ? (
            <div className="p-5"><Skeleton className="h-12 w-full" /></div>
          ) : (data?.today.length ?? 0) === 0 ? (
            <p className="text-muted-foreground px-5 py-10 text-center text-sm">No sessions scheduled today.</p>
          ) : (
            <ul className="divide-y">
              {data!.today.map((t) => (
                <li key={t.id}>
                  <button type="button" className="hover:bg-muted/50 flex w-full items-center gap-3 px-5 py-3 text-left" onClick={() => void navigate({ to: "/sessions/$id", params: { id: t.id } })}>
                    <span className="tnum text-muted-foreground w-24 text-sm font-medium">{t.start_time}–{t.end_time}</span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <ClassChip band={t.band} code={t.code} />
                      <span className="truncate text-sm font-semibold">{t.class_name}</span>
                    </span>
                    <span className="tnum text-muted-foreground hidden text-sm sm:inline">{t.present_count}/{t.enrolled_count}</span>
                    <SessionStatusBadge status={t.status as SessionStatus} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-5">
          {/* Top defaulters */}
          <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
            <div className="flex items-center gap-2 border-b px-5 py-3.5">
              <AlertTriangle className="text-muted-foreground size-4" />
              <h3 className="font-display text-sm font-bold">Top defaulters</h3>
            </div>
            {isLoading ? (
              <div className="p-5"><Skeleton className="h-10 w-full" /></div>
            ) : (data?.defaulters_top.length ?? 0) === 0 ? (
              <p className="text-muted-foreground px-5 py-8 text-center text-sm">Everyone's paid up.</p>
            ) : (
              <ul className="divide-y">
                {data!.defaulters_top.map((d) => (
                  <li key={d.student.id}>
                    <button type="button" className="hover:bg-muted/50 flex w-full items-center justify-between gap-2 px-5 py-2.5 text-left" onClick={() => void navigate({ to: "/students/$id", params: { id: d.student.id } })}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{d.student.full_name}</span>
                        <span className="text-muted-foreground tnum text-xs">{d.student.reg_no}</span>
                      </span>
                      <span className="tnum text-sm font-bold" style={{ color: "var(--bad)" }}>{formatLKR(d.outstanding_minor)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent activity */}
          <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
            <div className="flex items-center gap-2 border-b px-5 py-3.5">
              <Activity className="text-muted-foreground size-4" />
              <h3 className="font-display text-sm font-bold">Recent activity</h3>
            </div>
            {isLoading ? (
              <div className="p-5"><Skeleton className="h-10 w-full" /></div>
            ) : (
              <ul className="divide-y">
                {(data?.activity ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{humanizeAction(a.action)}</span>
                      <span className="text-muted-foreground text-xs">{a.actor_name ?? "System"}</span>
                    </span>
                    <span className="text-muted-foreground text-xs whitespace-nowrap">{timeAgo(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
