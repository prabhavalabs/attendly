/** Money is stored as INTEGER minor units (LKR cents). Never floats in logic. */

const FMT = new Intl.NumberFormat("en-LK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format minor units as a grouped amount, e.g. 500000 -> "5,000.00". */
export function formatAmount(minor: number): string {
  return FMT.format(minor / 100);
}

/** Format with the LKR prefix, e.g. "LKR 5,000.00". */
export function formatLKR(minor: number): string {
  return `LKR ${formatAmount(minor)}`;
}

/** Parse a major-unit string ("5000" / "5,000.50") into integer minor units. */
export function toMinor(input: string): number {
  const n = Number.parseFloat(input.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}
