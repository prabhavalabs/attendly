import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarPlus, CalendarCheck } from "lucide-react";

import { useClasses } from "@/hooks/use-classes";
import { useSessions } from "@/hooks/use-sessions";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/common/page-header";
import { Can } from "@/components/auth/can";
import { ClassChip } from "@/components/classes/band";
import { SessionStatusBadge } from "@/components/sessions/session-status";
import { GenerateDialog } from "@/components/sessions/generate-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function SessionsPage() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(iso(today));
  const [to, setTo] = useState(iso(new Date(today.getTime() + 30 * 86_400_000)));
  const [classId, setClassId] = useState(ALL);
  const [genOpen, setGenOpen] = useState(false);

  const { data: classes } = useClasses();
  const classItems = [
    { value: ALL, label: "All classes" },
    ...(classes ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const { data: sessions, isLoading } = useSessions({
    from,
    to,
    class_id: classId === ALL ? undefined : classId,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof sessions>>();
    for (const s of sessions ?? []) {
      const list = map.get(s.session_date) ?? [];
      list.push(s);
      map.set(s.session_date, list);
    }
    return [...map.entries()];
  }, [sessions]);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Sessions"
        description="Generate sessions from the timetable and open rosters for check-in."
        actions={
          <Can perm="session.manage">
            <Button onClick={() => setGenOpen(true)}>
              <CalendarPlus className="size-4" /> Generate
            </Button>
          </Can>
        }
      />

      <div className="bg-card mb-5 flex flex-wrap items-end gap-3 rounded-2xl border p-4" style={{ boxShadow: "var(--sh-flat)" }}>
        <div className="grid gap-1.5">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Class</Label>
          <Select value={classId} onValueChange={(v) => setClassId(v ?? ALL)} items={classItems}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {classItems.map((it) => (
                <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-2xl border py-16 text-center" style={{ boxShadow: "var(--sh-flat)" }}>
          <div className="bg-accent text-primary grid size-12 place-items-center rounded-2xl">
            <CalendarCheck className="size-6" />
          </div>
          <div>
            <div className="font-display font-semibold">No sessions in this range</div>
            <div className="text-muted-foreground text-sm">Add timetable slots to a class, then generate sessions.</div>
          </div>
        </div>
      ) : (
        <div className="grid gap-5">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{formatDate(date)}</div>
              <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
                <ul className="divide-y">
                  {items.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="hover:bg-muted/50 flex w-full items-center gap-4 px-5 py-3 text-left"
                        onClick={() => void navigate({ to: "/sessions/$id", params: { id: s.id } })}
                      >
                        <span className="tnum text-muted-foreground w-24 text-sm font-medium">
                          {s.start_time}–{s.end_time}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <ClassChip band={s.band} code={s.code} />
                          <span className="truncate text-sm font-semibold">{s.class_name}</span>
                        </span>
                        <span className="tnum text-muted-foreground hidden text-sm sm:inline">
                          {s.present_count}/{s.enrolled_count} present
                        </span>
                        <SessionStatusBadge status={s.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      <GenerateDialog open={genOpen} onOpenChange={setGenOpen} defaultFrom={from} defaultTo={to} />
    </div>
  );
}
