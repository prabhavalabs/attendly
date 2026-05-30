/** Class/batch edge-band palette + the class chip motif. */
import type { ClassBand } from "@tuition/shared";
import { cn } from "@/lib/utils";

export const BAND_VAR: Record<ClassBand, string> = {
  teal: "var(--band-teal)",
  amber: "var(--band-amber)",
  coral: "var(--band-coral)",
  blue: "var(--band-blue)",
  violet: "var(--band-violet)",
  green: "var(--band-green)",
};

export const BAND_OPTIONS: ClassBand[] = ["teal", "amber", "coral", "blue", "violet", "green"];

/** Solid pill chip in the class band colour, showing the short code. */
export function ClassChip({ band, code, className }: { band: ClassBand; code: string; className?: string }) {
  return (
    <span
      className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white", className)}
      style={{ background: BAND_VAR[band] }}
    >
      {code}
    </span>
  );
}

export function BandDot({ band, className }: { band: ClassBand; className?: string }) {
  return <span className={cn("inline-block size-2.5 rounded-[3px]", className)} style={{ background: BAND_VAR[band] }} />;
}
