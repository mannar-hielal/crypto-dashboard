/**
 * Funding display helpers (BYBIT_PARITY_PLAN BP-4) — pure, no React. The server settles funding;
 * these only format what the ticker says about the next settlement.
 */

/** Time left to the next funding settlement as "HH:MM:SS" (Bybit's countdown); "—" if unknown. */
export function formatFundingCountdown(nextFundingTime: number | null, now: number): string {
  if (nextFundingTime === null || !Number.isFinite(nextFundingTime)) return '—';
  const left = Math.max(0, Math.floor((nextFundingTime - now) / 1000));
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/** A funding rate as Bybit shows it: "0.0022%" (4 decimals). */
export function formatFundingRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(4)}%`;
}

/** What the ⓘ next to the funding rate says. */
export const FUNDING_EXPLAINER =
  'Funding: at each settlement (the countdown), every open USDT Perpetual position pays or receives ' +
  'position value (size × mark price) × the funding rate. A positive rate: longs pay shorts; a ' +
  'negative rate: shorts pay longs. It is paid from your available balance (then from the ' +
  'position margin if the balance is short), and it shows in Balance History and the Journal.';
