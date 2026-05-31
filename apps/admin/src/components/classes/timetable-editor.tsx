import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { WEEKDAYS, type TimetableSlot } from "@tuition/shared";

import { useAddSlot, useRemoveSlot } from "@/hooks/use-classes";
import { Can } from "@/components/auth/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WEEKDAY_ITEMS = WEEKDAYS.map((label, value) => ({ label, value: String(value) }));

export function TimetableEditor({ classId, slots }: { classId: string; slots: TimetableSlot[] }) {
  const addSlot = useAddSlot(classId);
  const removeSlot = useRemoveSlot(classId);

  const [weekday, setWeekday] = useState("1");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("10:00");
  const [room, setRoom] = useState("");

  async function add() {
    if (end <= start) {
      toast.error("End time must be after start.");
      return;
    }
    try {
      await addSlot.mutateAsync({
        weekday: Number.parseInt(weekday, 10),
        start_time: start,
        end_time: end,
        room: room.trim() === "" ? null : room.trim(),
      });
      setRoom("");
      toast.success("Slot added");
    } catch {
      toast.error("Could not add the slot.");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="bg-card rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
        {slots.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">No weekly slots yet. Add one below.</p>
        ) : (
          <ul className="divide-y">
            {slots.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="bg-secondary text-secondary-foreground w-12 rounded-full px-2 py-0.5 text-center text-xs font-semibold">
                    {WEEKDAYS[s.weekday]}
                  </span>
                  <span className="tnum text-sm font-medium">
                    {s.start_time}–{s.end_time}
                  </span>
                  {s.room ? <span className="text-muted-foreground text-sm">· {s.room}</span> : null}
                </div>
                <Can perm="timetable.manage">
                  <Button variant="ghost" size="icon-sm" aria-label="Remove slot" onClick={() => void removeSlot.mutateAsync(s.id)}>
                    <X className="size-4" />
                  </Button>
                </Can>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Can perm="timetable.manage">
        <div className="bg-card grid items-end gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]" style={{ boxShadow: "var(--sh-flat)" }}>
          <div className="grid gap-1.5">
            <Label className="text-xs">Day</Label>
            <Select value={weekday} onValueChange={(v) => setWeekday(v ?? "1")} items={WEEKDAY_ITEMS}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d, i) => (
                  <SelectItem key={d} value={String(i)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Start</Label>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">End</Label>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Room</Label>
            <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Optional" />
          </div>
          <Button onClick={() => void add()} disabled={addSlot.isPending}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </Can>
    </div>
  );
}
