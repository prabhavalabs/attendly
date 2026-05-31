import { useQueries } from "@tanstack/react-query";
import { WEEKDAYS, type Class, type TimetableSlot } from "@tuition/shared";

import { api } from "@/lib/api";
import { useClasses } from "@/hooks/use-classes";
import { PageHeader } from "@/components/common/page-header";
import { BAND_VAR } from "@/components/classes/band";
import { Skeleton } from "@/components/ui/skeleton";

type ClassDetail = Class & { timetable: TimetableSlot[] };
interface WeekSlot {
  classId: string;
  name: string;
  band: Class["band"];
  start: string;
  end: string;
  room: string | null;
}

export default function TimetablePage() {
  const { data: classes, isLoading } = useClasses();
  const active = (classes ?? []).filter((c) => c.status === "active");

  const details = useQueries({
    queries: active.map((c) => ({
      queryKey: ["class", c.id],
      queryFn: () => api.get<ClassDetail>(`/api/classes/${c.id}`),
    })),
  });

  // Bucket slots by weekday (0=Sun … 6=Sat).
  const byDay: WeekSlot[][] = WEEKDAYS.map(() => []);
  for (const d of details) {
    const cls = d.data;
    if (!cls) continue;
    for (const slot of cls.timetable) {
      byDay[slot.weekday]!.push({
        classId: cls.id,
        name: cls.name,
        band: cls.band,
        start: slot.start_time,
        end: slot.end_time,
        room: slot.room,
      });
    }
  }
  byDay.forEach((list) => list.sort((a, b) => a.start.localeCompare(b.start)));
  const anySlots = byDay.some((l) => l.length > 0);

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="Timetable" description="The weekly schedule across all active classes." />

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {WEEKDAYS.map((day, i) => (
            <div key={day} className="bg-card rounded-2xl border p-3" style={{ boxShadow: "var(--sh-flat)" }}>
              <div className="text-muted-foreground mb-2 text-center text-xs font-bold tracking-wide uppercase">{day}</div>
              <div className="grid gap-2">
                {byDay[i]!.length === 0 ? (
                  <div className="text-muted-foreground/50 py-3 text-center text-xs">—</div>
                ) : (
                  byDay[i]!.map((slot, idx) => (
                    <div
                      key={`${slot.classId}-${idx}`}
                      className="relative overflow-hidden rounded-[var(--radius-md)] border p-2.5"
                      style={{ boxShadow: "var(--sh-flat)" }}
                    >
                      <span className="absolute inset-y-0 left-0 w-1" style={{ background: BAND_VAR[slot.band] }} aria-hidden />
                      <div className="tnum pl-1.5 text-xs font-semibold">{slot.start}–{slot.end}</div>
                      <div className="truncate pl-1.5 text-xs">{slot.name}</div>
                      {slot.room ? <div className="text-muted-foreground pl-1.5 text-[11px]">{slot.room}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !anySlots ? (
        <p className="text-muted-foreground mt-4 text-center text-sm">
          No timetable slots yet. Add weekly slots from a class's Timetable tab.
        </p>
      ) : null}
    </div>
  );
}
