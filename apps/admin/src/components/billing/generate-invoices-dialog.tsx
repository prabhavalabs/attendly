import { useState } from "react";
import { toast } from "sonner";

import { useClasses } from "@/hooks/use-classes";
import { useGenerateInvoices } from "@/hooks/use-billing";
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

export function GenerateInvoicesDialog({
  open,
  onOpenChange,
  defaultPeriod,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPeriod: string;
}) {
  const { data: classes } = useClasses();
  const generate = useGenerateInvoices();
  const [period, setPeriod] = useState(defaultPeriod);
  const [classId, setClassId] = useState(ALL);

  const classItems = [
    { value: ALL, label: "All active classes" },
    ...(classes ?? []).filter((c) => c.status === "active").map((c) => ({ value: c.id, label: c.name })),
  ];

  async function run() {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      toast.error("Pick a month.");
      return;
    }
    try {
      const res = await generate.mutateAsync({ period, class_id: classId === ALL ? undefined : classId });
      toast.success(
        res.created === 0
          ? "No new invoices — they already exist for this period."
          : `${res.created} invoice${res.created === 1 ? "" : "s"} generated for ${period}.`,
      );
      onOpenChange(false);
    } catch {
      toast.error("Could not generate invoices.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate invoices</DialogTitle>
          <DialogDescription>
            Creates a monthly invoice for each active enrollment. Safe to re-run — existing invoices are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Billing month</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" />
          </div>
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
