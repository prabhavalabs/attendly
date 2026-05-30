/** Maps student & card status onto the design's five fixed status tones. */
import type { StudentStatus, CardStatus } from "@tuition/shared";
import { StatusBadge, type StatusTone } from "@/components/common/status-badge";

const STUDENT: Record<StudentStatus, { tone: StatusTone; label: string }> = {
  active: { tone: "ok", label: "Active" },
  inactive: { tone: "neutral", label: "Inactive" },
  graduated: { tone: "info", label: "Graduated" },
  withdrawn: { tone: "bad", label: "Withdrawn" },
};

const CARD: Record<CardStatus, { tone: StatusTone; label: string }> = {
  active: { tone: "ok", label: "Card active" },
  revoked: { tone: "bad", label: "Card revoked" },
  lost: { tone: "warn", label: "Card lost" },
};

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  const s = STUDENT[status];
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

export function CardStatusBadge({ status }: { status: CardStatus }) {
  const s = CARD[status];
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}
