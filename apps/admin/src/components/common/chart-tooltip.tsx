import type { ReactNode } from "react";

type Entry = {
  name?: ReactNode;
  value?: number | string;
  color?: string;
  /** recharts also exposes the bar/area fill here for single-series charts. */
  fill?: string;
};

/**
 * A solid, sleek tooltip for recharts charts — opaque card background, soft
 * shadow, a colour dot per series. Pass as `content={<ChartTooltip ... />}`;
 * recharts injects `active` / `payload` / `label` at runtime.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Entry[];
  label?: ReactNode;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const fmt = (v: number | string | undefined) => {
    const n = Number(v);
    return valueFormatter && Number.isFinite(n) ? valueFormatter(n) : String(v ?? "");
  };
  return (
    <div
      className="bg-card min-w-32 rounded-xl border px-3 py-2"
      style={{ boxShadow: "var(--sh-card)" }}
    >
      {label != null && label !== "" ? (
        <div className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wide">
          {label}
        </div>
      ) : null}
      <div className="grid gap-1">
        {payload.map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ background: e.color ?? e.fill ?? "var(--neutral)" }}
                aria-hidden
              />
              {e.name}
            </span>
            <span className="text-foreground tnum font-semibold">{fmt(e.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
