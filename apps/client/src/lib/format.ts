/**
 * Money and signed numbers the way Bybit writes them (owner, visual gate 2026-09-29): the sign
 * comes first and is a plain hyphen, zero carries no sign, and thousands are grouped —
 * `-$10.12`, `+$47.22`, `$0.00`, `$1,002.20`, `+12.50`, `0.00`.
 */

const grouped = (v: number, dp: number) =>
  Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** A zero after rounding to `dp` places (so `-0.001` at 2 dp is zero, not `-0.00`) */
const isZero = (v: number, dp: number) => Number(Math.abs(v).toFixed(dp)) === 0;

/** `$1,002.20`, `-$10.12` (unsigned when positive) */
export function fmtUsd(v: number, dp = 2): string {
  return `${v < 0 && !isZero(v, dp) ? '-' : ''}$${grouped(v, dp)}`;
}

/** `+$47.22`, `-$10.12`, `$0.00` */
export function fmtSignedUsd(v: number, dp = 2): string {
  if (isZero(v, dp)) return `$${grouped(0, dp)}`;
  return `${v > 0 ? '+' : '-'}$${grouped(v, dp)}`;
}

/** `+12.50`, `-5.10`, `0.00` — a signed amount without the currency (the unit shown next to it) */
export function fmtSigned(v: number, dp = 2): string {
  if (isZero(v, dp)) return grouped(0, dp);
  return `${v > 0 ? '+' : '-'}${grouped(v, dp)}`;
}

/** `+1.23%`, `-0.40%`, `0.00%` */
export function fmtSignedPct(v: number, dp = 2): string {
  return `${fmtSigned(v, dp)}%`;
}
