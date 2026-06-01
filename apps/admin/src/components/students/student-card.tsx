import type { ReactNode } from "react";
import { User, CalendarDays, Smartphone } from "lucide-react";

/** A hi-res, on-screen rendering of the student ID card (matches the print PDF). */
export function StudentCard({
  orgName,
  fullName,
  regNo,
  batch,
  active,
  qrUrl,
}: {
  orgName: string;
  fullName: string;
  regNo: string;
  batch: string;
  active: boolean;
  qrUrl?: string;
}) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-[26px] text-white"
      style={{
        background: "linear-gradient(135deg, #1a9384 0%, #0e766a 52%, #0a4f47 100%)",
        boxShadow: "0 24px 60px -20px rgba(10,79,71,0.6)",
      }}
    >
      {/* decorative dot grid (top-right) */}
      <div
        className="pointer-events-none absolute top-7 right-7 h-[70px] w-[118px] opacity-50"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.4) 1.2px, transparent 1.2px)",
          backgroundSize: "12px 12px",
        }}
        aria-hidden
      />
      {/* decorative flowing lines (bottom-right) */}
      <svg
        className="pointer-events-none absolute right-0 bottom-0 h-1/2 w-2/3 opacity-[0.13]"
        viewBox="0 0 320 180"
        fill="none"
        stroke="white"
        strokeWidth="1.4"
        aria-hidden
      >
        <path d="M-10 170 Q 150 90 330 128" />
        <path d="M-10 190 Q 170 104 340 144" />
        <path d="M30 198 Q 200 118 350 162" />
      </svg>

      {/* header */}
      <div className="flex items-center gap-4 px-7 pt-6">
        <img
          src="/icons/attendly-icon.svg"
          alt=""
          className="size-14 rounded-[18px] shadow-lg ring-1 ring-white/15"
          aria-hidden
        />
        <div className="min-w-0">
          <div className="font-display truncate text-[26px] leading-none font-extrabold tracking-tight">
            {orgName}
          </div>
          <div
            className="mt-1.5 text-[11px] font-semibold tracking-[0.22em]"
            style={{ color: "rgba(180,236,226,0.85)" }}
          >
            STUDENT ID CARD
          </div>
        </div>
      </div>

      {/* white content panel */}
      <div className="mx-5 mt-5 rounded-[22px] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[28px] leading-[1.05] font-extrabold tracking-tight text-[var(--ink-900)]">
              {fullName}
            </h2>
            <div className="mt-3 h-[5px] w-20 rounded-full" style={{ background: "var(--band-amber)" }} />
            <div className="mt-5 space-y-3">
              <InfoRow icon={<User className="size-4" />} text={regNo} />
              <InfoRow icon={<CalendarDays className="size-4" />} text={batch} />
            </div>
            <div className="mt-5">
              <Chip ok={active} label={active ? "ACTIVE" : "INACTIVE"} />
            </div>
          </div>

          <div className="shrink-0 text-center">
            <div className="rounded-2xl border bg-white p-2.5" style={{ boxShadow: "var(--sh-flat)" }}>
              {qrUrl ? (
                <img src={qrUrl} alt="Check-in QR" className="size-[128px]" />
              ) : (
                <div className="bg-muted size-[128px] animate-pulse rounded-lg" />
              )}
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5 text-sm">
              <Smartphone className="text-primary size-4" /> Scan to check in
            </div>
          </div>
        </div>
      </div>

      {/* footer wordmark */}
      <div className="px-7 pt-4 pb-5">
        <span className="font-display text-lg font-extrabold tracking-tight">attendly</span>
      </div>
    </div>
  );
}

function InfoRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-accent text-primary grid size-8 shrink-0 place-items-center rounded-full">{icon}</span>
      <span className="tnum text-[17px] font-semibold text-[var(--ink-700)]">{text}</span>
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  const c = ok ? "var(--ok)" : "var(--bad)";
  const ink = ok ? "var(--ok-ink)" : "var(--bad-ink)";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold"
      style={{ background: `color-mix(in srgb, ${c} 14%, white)`, color: ink }}
    >
      <span className="size-2 rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}
