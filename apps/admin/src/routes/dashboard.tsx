import { useNavigate } from "@tanstack/react-router";
import { CalendarCheck, AlertTriangle, Activity } from "lucide-react";
import type { SessionStatus } from "@tuition/shared";

import { useAuthStore } from "@/lib/auth-store";
import { useDashboard } from "@/hooks/use-dashboard";
import { useT } from "@/lib/i18n";
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
  const t = useT();

  const s = data?.summary;
  const kpis = [
    { label: t("dash.activeStudents"), value: s ? String(s.active_students) : "—", sub: t("dash.enrolledTerm"), accent: "var(--brand-500)" },
    { label: t("dash.todaySessions"), value: s ? String(s.today_sessions) : "—", sub: t("dash.acrossClasses"), accent: "var(--band-blue)" },
    { label: t("dash.outstanding"), value: s ? formatLKR(s.outstanding_minor) : "—", sub: t("dash.awaitingCollection"), accent: "var(--warn)" },
    {
      label: t("dash.attendanceRate"),
      value: s ? (s.attendance_rate == null ? "—" : `${Math.round(s.attendance_rate * 100)}%`) : "—",
      sub: t("dash.rolling30"),
      accent: "var(--ok)",
    },
  ];

  return (
    <div className="p-6 md:p-8">
      <PageHeader title={`${t("dash.welcome")}, ${firstName}`} description={t("dash.subtitle")} />

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
            <h3 className="font-display text-sm font-bold">{t("dash.todayHeading")}</h3>
          </div>
          {isLoading ? (
            <div className="p-5"><Skeleton className="h-12 w-full" /></div>
          ) : (data?.today.length ?? 0) === 0 ? (
            <p className="text-muted-foreground px-5 py-10 text-center text-sm">{t("dash.noSessionsToday")}</p>
          ) : (
            <ul className="divide-y">
              {data!.today.map((sess) => (
                <li key={sess.id}>
                  <button type="button" className="hover:bg-muted/50 flex w-full items-center gap-3 px-5 py-3 text-left" onClick={() => void navigate({ to: "/sessions/$id", params: { id: sess.id } })}>
                    <span className="tnum text-muted-foreground w-24 text-sm font-medium">{sess.start_time}–{sess.end_time}</span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <ClassChip band={sess.band} code={sess.code} />
                      <span className="truncate text-sm font-semibold">{sess.class_name}</span>
                    </span>
                    <span className="tnum text-muted-foreground hidden text-sm sm:inline">{sess.present_count}/{sess.enrolled_count}</span>
                    <SessionStatusBadge status={sess.status as SessionStatus} />
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
              <h3 className="font-display text-sm font-bold">{t("dash.topDefaulters")}</h3>
            </div>
            {isLoading ? (
              <div className="p-5"><Skeleton className="h-10 w-full" /></div>
            ) : (data?.defaulters_top.length ?? 0) === 0 ? (
              <p className="text-muted-foreground px-5 py-8 text-center text-sm">{t("dash.allPaid")}</p>
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
              <h3 className="font-display text-sm font-bold">{t("dash.recentActivity")}</h3>
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
