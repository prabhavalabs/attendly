/** attendly brand mark — the ID-card glyph (teal tile, amber + white bands). */
import { cn } from "@/lib/utils";

export function BrandGlyph({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: "var(--brand-600)",
        boxShadow: "var(--sh-flat)",
      }}
      aria-hidden
    >
      <span
        className="absolute rounded-[2px]"
        style={{
          left: size * 0.19,
          right: size * 0.19,
          top: size * 0.28,
          height: Math.max(3, size * 0.11),
          background: "var(--band-amber)",
        }}
      />
      <span
        className="absolute rounded-[2px]"
        style={{
          left: size * 0.19,
          right: size * 0.19,
          bottom: size * 0.17,
          height: Math.max(6, size * 0.22),
          background: "rgba(255,255,255,.85)",
        }}
      />
    </div>
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
