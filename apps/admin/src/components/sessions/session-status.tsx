import type { SessionStatus } from "@tuition/shared";
import { StatusBadge, type StatusTone } from "@/components/common/status-badge";

const MAP: Record<SessionStatus, { tone: StatusTone; label: string }> = {
  scheduled: { tone: "neutral", label: "Scheduled" },
  open: { tone: "ok", label: "Open" },
  closed: { tone: "info", label: "Closed" },
  cancelled: { tone: "bad", label: "Cancelled" },
};

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const s = MAP[status];
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}
