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

/**
 * The start of every funding settlement's Balance History action — the server writes
 * "Funding fee for long BTCUSDT (rate …)" (engine/actions.ts settleFunding; its exact wording is
 * pinned by apps/server/src/trading/engine/__tests__/funding.test.ts).
 */
const FUNDING_ACTION_PREFIX = 'Funding fee for ';

/** True for a funding payment's Balance History row: money moved, not a closed trade. */
export function isFundingBalanceEvent(e: { action: string }): boolean {
  return e.action.startsWith(FUNDING_ACTION_PREFIX);
}

/**
 * Win rate (%) of closed trades from Balance History: rows with a non-zero PnL are closes, except
 * funding payments (BP-4), which are neither wins nor losses. Null with no closed trade.
 */
export function winRateFrom(balanceLog: { pnl: number; action: string }[]): number | null {
  const closes = balanceLog.filter((e) => e.pnl !== 0 && !isFundingBalanceEvent(e));
  if (closes.length === 0) return null;
  return (closes.filter((e) => e.pnl > 0).length / closes.length) * 100;
}
