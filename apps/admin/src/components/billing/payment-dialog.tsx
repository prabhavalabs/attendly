import { useState } from "react";
import { toast } from "sonner";
import type { Invoice, PaymentMethod } from "@tuition/shared";

import { useRecordPayment, openReceiptPdf } from "@/hooks/use-billing";
import { toMinor, formatAmount, formatLKR } from "@/lib/money";
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

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
  { value: "online", label: "Online" },
];

export function PaymentDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const record = useRecordPayment();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");

  // Seed the amount with the outstanding balance whenever a new invoice opens.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (invoice && seededFor !== invoice.id) {
    setSeededFor(invoice.id);
    setAmount(formatAmount(Math.max(0, invoice.outstanding_minor)));
    setMethod("cash");
    setNote("");
  }

  async function submit() {
    if (!invoice) return;
    const amount_minor = toMinor(amount);
    if (amount_minor <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    try {
      const res = await record.mutateAsync({
        invoice_id: invoice.id,
        amount_minor,
        method,
        note: note.trim() === "" ? null : note.trim(),
      });
      toast.success(`Payment recorded · ${res.payment.receipt_no}`);
      onOpenChange(false);
      void openReceiptPdf(res.payment.id);
    } catch {
      toast.error("Could not record the payment.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {invoice
              ? `${invoice.student_name} · ${invoice.period} · outstanding ${formatLKR(Math.max(0, invoice.outstanding_minor))}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Amount (LKR)</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Method</Label>
            <Select value={method} onValueChange={(v) => setMethod((v as PaymentMethod) ?? "cash")} items={METHODS}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={record.isPending}>
            {record.isPending ? "Recording…" : "Record & print receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
