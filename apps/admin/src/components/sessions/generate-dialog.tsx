import { useState } from "react";
import { toast } from "sonner";

import { useClasses } from "@/hooks/use-classes";
import { useGenerateSessions } from "@/hooks/use-sessions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

export function GenerateDialog({
  open,
  onOpenChange,
  defaultFrom,
  defaultTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFrom: string;
  defaultTo: string;
}) {
  const { data: classes } = useClasses();
  const generate = useGenerateSessions();
  const [classId, setClassId] = useState(ALL);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const activeClasses = (classes ?? []).filter((c) => c.status === "active");
  const classItems = [
    { value: ALL, label: "All active classes" },
    ...activeClasses.map((c) => ({ value: c.id, label: c.name })),
  ];

  async function run() {
    if (to < from) {
      toast.error("End date must be on or after the start date.");
      return;
    }
    try {
      const res = await generate.mutateAsync({ from, to, class_id: classId === ALL ? undefined : classId });
      toast.success(
        res.created === 0
          ? "No new sessions — everything in range already exists."
          : `${res.created} session${res.created === 1 ? "" : "s"} generated across ${res.classes} ${res.classes === 1 ? "class" : "classes"}.`,
      );
      onOpenChange(false);
    } catch {
      toast.error("Could not generate sessions.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate sessions</DialogTitle>
          <DialogDescription>
            Materializes sessions from each class's weekly timetable. Safe to re-run — existing dates are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Class</Label>
            <Select value={classId} onValueChange={(v) => setClassId(v ?? ALL)} items={classItems}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {classItems.map((it) => (
                  <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void run()} disabled={generate.isPending}>
            {generate.isPending ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
