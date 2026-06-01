/** attendly brand mark — the real ID-card app icon (same asset as the favicon). */
import { cn } from "@/lib/utils";

export function BrandGlyph({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/icons/attendly-icon.svg"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        boxShadow: "var(--sh-flat)",
      }}
      aria-hidden
    />
  );
}

export function Wordmark({ className, size = 19 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn("font-display font-extrabold tracking-[-0.03em] text-foreground", className)}
      style={{ fontSize: size }}
    >
      attend<span className="text-primary">ly</span>
    </span>
  );
}
