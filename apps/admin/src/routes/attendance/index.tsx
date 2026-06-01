import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardCheck, ChevronRight } from "lucide-react";

import { useSessions } from "@/hooks/use-sessions";
import { Page } from "@/components/layout/page";
import { ClassChip } from "@/components/classes/band";
import { SessionStatusBadge } from "@/components/sessions/session-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function AttendancePage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(iso(new Date()));
  const { data, isLoading } = useSessions({ from: date, to: date });
  const sessions = data?.sessions;

  return (
    <Page title="Attendance" description="Pick a day and open a session to mark the roster.">
      <div className="bg-card mb-5 flex items-end gap-3 rounded-2xl border p-4" style={{ boxShadow: "var(--sh-flat)" }}>
        <div className="grid gap-1.5">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setDate(iso(new Date()))}>Today</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : (sessions ?? []).length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-2xl border py-16 text-center" style={{ boxShadow: "var(--sh-flat)" }}>
          <div className="bg-accent text-primary grid size-12 place-items-center rounded-2xl">
            <ClipboardCheck className="size-6" />
          </div>
          <div>
            <div className="font-display font-semibold">No sessions on this day</div>
            <div className="text-muted-foreground text-sm">Pick another date, or generate sessions from the timetable.</div>
          </div>
        </div>
      ) : (
        <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
          <ul className="divide-y">
            {(sessions ?? []).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="hover:bg-muted/50 flex w-full items-center gap-4 px-5 py-3.5 text-left"
                  onClick={() => void navigate({ to: "/sessions/$id", params: { id: s.id } })}
                >
                  <span className="tnum text-muted-foreground w-24 text-sm font-medium">{s.start_time}–{s.end_time}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <ClassChip band={s.band} code={s.code} />
                    <span className="truncate text-sm font-semibold">{s.class_name}</span>
                  </span>
                  <span className="tnum text-muted-foreground text-sm">{s.present_count}/{s.enrolled_count} present</span>
                  <SessionStatusBadge status={s.status} />
                  <ChevronRight className="text-muted-foreground size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}
