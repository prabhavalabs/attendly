import { useState } from "react";
import { toast } from "sonner";
import type { Invoice } from "@tuition/shared";

import { useUpdateInvoice } from "@/hooks/use-billing";
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

export function WaiveDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateInvoice();
  const [reason, setReason] = useState("");

  async function submit() {
    if (!invoice) return;
    try {
      await update.mutateAsync({ id: invoice.id, input: { waive: true, waived_reason: reason.trim() || undefined } });
      toast.success("Invoice waived");
      setReason("");
      onOpenChange(false);
    } catch {
      toast.error("Could not waive the invoice.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Waive invoice</DialogTitle>
          <DialogDescription>
            {invoice ? `${invoice.student_name} · ${invoice.period}. The balance is cleared and won't be billed.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label className="text-xs">Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. scholarship" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={() => void submit()} disabled={update.isPending}>
            {update.isPending ? "Waiving…" : "Waive invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
