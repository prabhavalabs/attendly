import { useAuthStore } from "@/lib/auth-store";
import { PageHeader } from "@/components/common/page-header";

interface Kpi {
  label: string;
  value: string;
  cur?: string;
  sub: string;
  accent: string;
}

const KPIS: Kpi[] = [
  { label: "Active students", value: "—", sub: "Enrolled this term", accent: "var(--brand-500)" },
  { label: "Today's sessions", value: "—", sub: "Across all classes", accent: "var(--band-blue)" },
  { label: "Outstanding fees", value: "—", cur: "LKR", sub: "Awaiting collection", accent: "var(--warn)" },
  { label: "Attendance rate", value: "—", sub: "Rolling 30 days", accent: "var(--ok)" },
];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name.split(" ")[0] ?? "there";

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's the shape of your class at a glance. Live data lands as each module ships."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-card relative overflow-hidden rounded-2xl border p-5"
            style={{ boxShadow: "var(--sh-flat)" }}
          >
            <span
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: kpi.accent }}
              aria-hidden
            />
            <div className="text-muted-foreground text-sm font-semibold">{kpi.label}</div>
            <div className="text-foreground mt-3 font-display text-3xl font-extrabold tracking-tight tnum">
              {kpi.cur ? <span className="text-muted-foreground mr-1 text-sm font-semibold">{kpi.cur}</span> : null}
              {kpi.value}
            </div>
            <div className="text-muted-foreground mt-2 text-xs">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div
        className="bg-card mt-6 rounded-2xl border p-6"
        style={{ boxShadow: "var(--sh-flat)" }}
      >
        <h3 className="font-display text-base font-bold">Getting started</h3>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          Authentication and role-based access are live. Next up on the roadmap:
          Students &amp; cards, then classes, sessions and the door check-in flow.
          Use <span className="text-foreground font-semibold">Users &amp; Roles</span> to
          invite staff and tune permissions.
        </p>
      </div>
    </div>
  );
}
