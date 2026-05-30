import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { SessionStatus, RosterEntry } from "@tuition/shared";

import { useRoster, useUpdateSession, useMarkAttendance, useClearAttendance } from "@/hooks/use-sessions";
import { formatDate } from "@/lib/format";
import { Can } from "@/components/auth/can";
import { UserAvatar } from "@/components/common/user-avatar";
import { ClassChip } from "@/components/classes/band";
import { SessionStatusBadge } from "@/components/sessions/session-status";
import { AttendanceMarker } from "@/components/sessions/attendance-marker";
import { StatusBadge, type StatusTone } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUSES: SessionStatus[] = ["scheduled", "open", "closed", "cancelled"];
const ATT_TONE: Record<NonNullable<RosterEntry["status"]>, StatusTone> = {
  present: "ok",
  late: "warn",
  absent: "bad",
  excused: "neutral",
};

export default function SessionRosterPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { data, isLoading, isError } = useRoster(id);
  const updateSession = useUpdateSession(id);
  const markAttendance = useMarkAttendance(id);
  const clearAttendance = useClearAttendance(id);
  const [topic, setTopic] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <Skeleton className="mb-4 h-4 w-20" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }
  if (isError || !data?.session) {
    return (
      <div className="p-6 md:p-8">
        <Link to="/sessions" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4" /> Sessions
        </Link>
        <div className="text-muted-foreground mt-10 text-center text-sm">Session not found.</div>
      </div>
    );
  }

  const s = data.session;
  const topicValue = topic ?? s.topic ?? "";

  async function setStatus(status: SessionStatus) {
    await updateSession.mutateAsync({ status });
    toast.success(`Session ${status}`);
  }

  async function saveTopic() {
    if ((topic ?? "") === (s.topic ?? "")) return;
    await updateSession.mutateAsync({ topic: topicValue.trim() === "" ? null : topicValue.trim() });
    toast.success("Topic saved");
  }

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-8">
      <Link to="/sessions" className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm">
        <ChevronLeft className="size-4" /> Sessions
      </Link>

      <div className="bg-card mb-5 rounded-2xl border p-6" style={{ boxShadow: "var(--sh-card)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ClassChip band={s.band} code={s.code} />
              <SessionStatusBadge status={s.status} />
            </div>
            <h2 className="font-display mt-2 text-2xl font-bold tracking-tight">{s.class_name}</h2>
            <div className="text-muted-foreground tnum mt-1 text-sm">
              {formatDate(s.session_date)} · {s.start_time}–{s.end_time} · {s.present_count}/{s.enrolled_count} present
            </div>
          </div>
          <Can perm="session.manage">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
                    Status <ChevronDown className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                {STATUSES.map((st) => (
                  <DropdownMenuItem key={st} onClick={() => void setStatus(st)} className="capitalize">
                    {st}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Can>
        </div>
        <div className="mt-4">
          <Can
            perm="session.manage"
            fallback={s.topic ? <p className="text-sm"><span className="text-muted-foreground">Topic: </span>{s.topic}</p> : null}
          >
            <Input
              value={topicValue}
              onChange={(e) => setTopic(e.target.value)}
              onBlur={() => void saveTopic()}
              placeholder="Lesson topic (optional)"
              className="max-w-md"
            />
          </Can>
        </div>
      </div>

      <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
        {data.roster.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">No students enrolled in this class.</p>
        ) : (
          <ul className="divide-y">
            {data.roster.map((e) => (
              <li key={e.student.id} className="flex items-center gap-3 px-5 py-3">
                <UserAvatar name={e.student.full_name} seed={e.student.id} photoUrl={e.student.photo_url} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{e.student.full_name}</div>
                  <div className="text-muted-foreground tnum text-xs">{e.student.reg_no}</div>
                </div>
                <Can
                  perm="attendance.record"
                  fallback={
                    e.status ? (
                      <StatusBadge tone={ATT_TONE[e.status]} className="capitalize">{e.status}</StatusBadge>
                    ) : (
                      <span className="text-muted-foreground text-xs">Not marked</span>
                    )
                  }
                >
                  <AttendanceMarker
                    status={e.status}
                    disabled={markAttendance.isPending || clearAttendance.isPending}
                    onMark={(status) => markAttendance.mutate({ studentId: e.student.id, status })}
                    onClear={() => clearAttendance.mutate(e.student.id)}
                  />
                </Can>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-muted-foreground mt-3 text-center text-xs">
        Mark students above, or scan their cards at the door with the mobile app.
      </p>
    </div>
  );
}
