import { useState } from "react";
import { toast } from "sonner";
import type { Enrollment } from "@tuition/shared";

import { useUpdateEnrollment } from "@/hooks/use-classes";
import { toMinor, formatAmount } from "@/lib/money";
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

export function EnrollmentFeeDialog({
  classId,
  enrollment,
  open,
  onOpenChange,
}: {
  classId: string;
  enrollment: Enrollment | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdateEnrollment(classId);
  const [amount, setAmount] = useState("");

  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (enrollment && seededFor !== enrollment.id) {
    setSeededFor(enrollment.id);
    setAmount(formatAmount(enrollment.effective_fee_minor));
  }

  async function save(useDefault: boolean) {
    if (!enrollment) return;
    try {
      await update.mutateAsync({
        eid: enrollment.id,
        input: { fee_override_minor: useDefault ? null : toMinor(amount) },
      });
      toast.success(useDefault ? "Reset to class fee" : "Fee override saved");
      onOpenChange(false);
    } catch {
      toast.error("Could not update the fee.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Override fee</DialogTitle>
          <DialogDescription>
            {enrollment ? `${enrollment.student.full_name} — set a per-student monthly fee for this class.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label className="text-xs">Monthly fee (LKR)</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => void save(true)} disabled={update.isPending}>
            Use class fee
          </Button>
          <Button onClick={() => void save(false)} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
