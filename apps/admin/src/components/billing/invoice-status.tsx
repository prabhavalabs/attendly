import type { InvoiceStatus } from "@tuition/shared";
import { StatusBadge, type StatusTone } from "@/components/common/status-badge";

const MAP: Record<InvoiceStatus, { tone: StatusTone; label: string }> = {
  pending: { tone: "neutral", label: "Pending" },
  partial: { tone: "warn", label: "Partial" },
  paid: { tone: "ok", label: "Paid" },
  overdue: { tone: "bad", label: "Overdue" },
  waived: { tone: "neutral", label: "Waived" },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const s = MAP[status];
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}
