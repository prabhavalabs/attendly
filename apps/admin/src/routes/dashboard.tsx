import type { ComponentType } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Users,
  CalendarClock,
  Banknote,
  TrendingUp,
  CalendarCheck,
  AlertTriangle,
  Activity,
  LogIn,
  CheckCircle2,
  Receipt,
  UserPlus,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SessionStatus } from "@tuition/shared";

import { useAuthStore } from "@/lib/auth-store";
import { useDashboard } from "@/hooks/use-dashboard";
import { useRevenueReport } from "@/hooks/use-reports";
import { useT } from "@/lib/i18n";
import { formatLKR } from "@/lib/money";
import { timeAgo } from "@/lib/format";
import { Page } from "@/components/layout/page";
import { ClassChip } from "@/components/classes/band";
import { ChartTooltip } from "@/components/common/chart-tooltip";
import { SessionStatusBadge } from "@/components/sessions/session-status";
import { UserAvatar } from "@/components/common/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";

function humanizeAction(action: string): string {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Map an audit action to an icon + accent for the activity feed. */
function activityStyle(action: string): { icon: ComponentType<{ className?: string }>; color: string } {
  if (/login|logout|auth/i.test(action)) return { icon: LogIn, color: "var(--neutral)" };
  if (/payment/i.test(action)) return { icon: Banknote, color: "var(--ok)" };
  if (/attendance|checkin/i.test(action)) return { icon: CheckCircle2, color: "var(--brand-500)" };
  if (/session/i.test(action)) return { icon: CalendarClock, color: "var(--band-blue)" };
  if (/invoice|billing|waive/i.test(action)) return { icon: Receipt, color: "var(--warn)" };
  if (/student|guardian|enroll/i.test(action)) return { icon: UserPlus, color: "var(--brand-600)" };
  return { icon: Activity, color: "var(--neutral)" };
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  loading,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  accent: string;
  loading: boolean;
}) {
  return (
    <div
      className="bg-card relative overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-0.5"
      style={{ boxShadow: "var(--sh-flat)" }}
    >
      <span
        className="pointer-events-none absolute -top-8 -right-8 size-28 rounded-full opacity-[0.10]"
        style={{ background: accent }}
        aria-hidden
      />
      <div className="flex items-start justify-between">
        <div className="text-muted-foreground text-sm font-semibold">{label}</div>
        <span
          className="grid size-9 place-items-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
        >
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div className="font-display tnum mt-3 text-3xl font-extrabold tracking-tight">
        {loading ? <Skeleton className="h-8 w-24" /> : value}
      </div>
      <div className="text-muted-foreground mt-1.5 text-xs">{sub}</div>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
      <div className="flex items-center gap-2 border-b px-5 py-3.5">
        <Icon className="text-muted-foreground size-4" />
        <h3 className="font-display text-sm font-bold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name.split(" ")[0] ?? "there";
  const { data, isLoading } = useDashboard();
  const { data: revenue } = useRevenueReport();
  const t = useT();

  const s = data?.summary;

  const rev = (revenue ?? [])
    .slice()
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-6)
    .map((r) => ({ period: r.period.slice(2), Billed: r.billed_minor / 100, Collected: r.collected_minor / 100 }));
  const totBilled = (revenue ?? []).reduce((n, r) => n + r.billed_minor, 0);
  const totCollected = (revenue ?? []).reduce((n, r) => n + r.collected_minor, 0);
  const collectionRate = totBilled > 0 ? Math.round((totCollected / totBilled) * 100) : null;

  return (
    <Page title={`${t("dash.welcome")}, ${firstName}`} description={t("dash.subtitle")}>
      {/* KPI stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label={t("dash.activeStudents")}
          value={s ? String(s.active_students) : "—"}
          sub={t("dash.enrolledTerm")}
          accent="var(--brand-500)"
          loading={isLoading}
        />
        <StatCard
          icon={CalendarClock}
          label={t("dash.todaySessions")}
          value={s ? String(s.today_sessions) : "—"}
          sub={t("dash.acrossClasses")}
          accent="var(--band-blue)"
          loading={isLoading}
        />
        <StatCard
          icon={Banknote}
          label={t("dash.outstanding")}
          value={s ? formatLKR(s.outstanding_minor) : "—"}
          sub={collectionRate == null ? t("dash.awaitingCollection") : `${collectionRate}% collected to date`}
          accent="var(--warn)"
          loading={isLoading}
        />
        <StatCard
          icon={TrendingUp}
          label={t("dash.attendanceRate")}
          value={s ? (s.attendance_rate == null ? "—" : `${Math.round(s.attendance_rate * 100)}%`) : "—"}
          sub={t("dash.rolling30")}
          accent="var(--ok)"
          loading={isLoading}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {/* Collections chart */}
          <Panel icon={Banknote} title="Collections — last 6 months">
            {rev.length === 0 ? (
              <p className="text-muted-foreground px-5 py-12 text-center text-sm">No billing data yet.</p>
            ) : (
              <div className="px-3 pt-4 pb-2">
                <ResponsiveContainer width="100%" height={208}>
                  <AreaChart data={rev} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashCollected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ok)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--ok)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="dashBilled" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--neutral)" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="var(--neutral)" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="period" tick={{ fill: "var(--ink-500)", fontSize: 12 }} stroke="var(--border)" tickLine={false} />
                    <YAxis
                      tick={{ fill: "var(--ink-500)", fontSize: 12 }}
                      stroke="var(--border)"
                      tickLine={false}
                      width={48}
                      tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                    />
                    <Tooltip
                      cursor={{ stroke: "var(--border)" }}
                      content={<ChartTooltip valueFormatter={(v) => formatLKR(Math.round(v * 100))} />}
                    />
                    <Area type="monotone" dataKey="Billed" stroke="var(--neutral)" strokeWidth={1.5} fill="url(#dashBilled)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="Collected" stroke="var(--ok)" strokeWidth={2} fill="url(#dashCollected)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          {/* Today's sessions */}
          <Panel icon={CalendarCheck} title={t("dash.todayHeading")}>
            {isLoading ? (
              <div className="p-5"><Skeleton className="h-12 w-full" /></div>
            ) : (data?.today.length ?? 0) === 0 ? (
              <p className="text-muted-foreground px-5 py-10 text-center text-sm">{t("dash.noSessionsToday")}</p>
            ) : (
              <ul className="divide-y">
                {data!.today.map((sess) => (
                  <li key={sess.id}>
                    <button
                      type="button"
                      className="hover:bg-muted/50 flex w-full items-center gap-3 px-5 py-3 text-left"
                      onClick={() => void navigate({ to: "/sessions/$id", params: { id: sess.id } })}
                    >
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
          </Panel>
        </div>

        <div className="space-y-5">
          {/* Top defaulters */}
          <Panel icon={AlertTriangle} title={t("dash.topDefaulters")}>
            {isLoading ? (
              <div className="p-5"><Skeleton className="h-10 w-full" /></div>
            ) : (data?.defaulters_top.length ?? 0) === 0 ? (
              <p className="text-muted-foreground px-5 py-8 text-center text-sm">{t("dash.allPaid")}</p>
            ) : (
              <ul className="divide-y">
                {data!.defaulters_top.map((d) => (
                  <li key={d.student.id}>
                    <button
                      type="button"
                      className="hover:bg-muted/50 flex w-full items-center gap-3 px-5 py-2.5 text-left"
                      onClick={() => void navigate({ to: "/students/$id", params: { id: d.student.id } })}
                    >
                      <UserAvatar name={d.student.full_name} seed={d.student.id} photoUrl={d.student.photo_url} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{d.student.full_name}</span>
                        <span className="text-muted-foreground tnum text-xs">{d.student.reg_no}</span>
                      </span>
                      <span className="tnum text-sm font-bold" style={{ color: "var(--bad)" }}>{formatLKR(d.outstanding_minor)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Recent activity */}
          <Panel icon={Activity} title={t("dash.recentActivity")}>
            {isLoading ? (
              <div className="p-5"><Skeleton className="h-10 w-full" /></div>
            ) : (
              <ul className="divide-y">
                {(data?.activity ?? []).map((a) => {
                  const st = activityStyle(a.action);
                  return (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                      <span
                        className="grid size-7 shrink-0 place-items-center rounded-lg"
                        style={{ background: `color-mix(in srgb, ${st.color} 14%, transparent)`, color: st.color }}
                      >
                        <st.icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{humanizeAction(a.action)}</span>
                        <span className="text-muted-foreground text-xs">{a.actor_name ?? "System"}</span>
                      </span>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">{timeAgo(a.created_at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </Page>
  );
}
