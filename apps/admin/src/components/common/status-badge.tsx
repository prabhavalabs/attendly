/**
 * Status badge — the design's five fixed semantics (learn once, use everywhere).
 * green=ok, amber=warn, red=bad, gray=neutral, brand=info.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "warn" | "bad" | "neutral" | "info";

const TONES: Record<StatusTone, string> = {
  ok: "bg-ok-bg text-ok-ink border-ok-border",
  warn: "bg-warn-bg text-warn-ink border-warn-border",
  bad: "bg-bad-bg text-bad-ink border-bad-border",
  neutral: "bg-status-neutral-bg text-status-neutral-ink border-status-neutral-border",
  info: "bg-accent text-brand-700 border-brand-200",
};

export function StatusBadge({
  tone,
  children,
  dot = true,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
