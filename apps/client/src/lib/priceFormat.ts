/**
 * The candles' price format for a market's symbol: its Bybit price tick as the step and its decimals
 * as the precision (BTCUSDT perp 0.1 → 1 decimal, DOGEUSDT 0.00001 → 5). Without it lightweight-charts
 * shows every symbol at 0.01 — DOGE at 0.18 — and the drawings count ticks of 0.01 (their pip is the
 * series' `minMove`).
 */

import { priceTickSize, type MarketCategory } from '@crypto-dashboard/sdk';

/** Decimals of a step: 0.001 → 3, 1 → 0; `fallback` for no step */
export function stepDecimals(step: number, fallback = 3): number {
  return step > 0 ? Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)) : fallback;
}

/** The series' `priceFormat`, or null for a symbol with no known tick (keeps the library's) */
export function candlePriceFormat(
  category: MarketCategory,
  symbol: string
): { type: 'price'; precision: number; minMove: number } | null {
  const tick = priceTickSize(category, symbol);
  if (!(tick > 0)) return null;
  return { type: 'price', precision: stepDecimals(tick), minMove: tick };
}
