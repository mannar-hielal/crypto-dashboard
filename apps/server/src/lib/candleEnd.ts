/**
 * History requests with an `end` time (`GET /api/market/candles?end=`): snapping `end` down to the
 * open time of the candle it falls in. Bybit returns the candles that open at or before `end`, so
 * the snapped value gives exactly the same candles, and every `end` inside one candle shares one
 * coalescing and cache key instead of each becoming its own upstream call. Pure: no I/O.
 */

/** Fixed-length intervals in ms; `1w` (Monday-based) and `1M` (calendar months) are handled apart */
const FIXED_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

const DAY_MS = 86_400_000;
/** 1 Jan 1970 was a Thursday: Bybit's weekly candles open on Mondays, 4 days later in the cycle */
const MONDAY_OFFSET_MS = 4 * DAY_MS;

/** The open time (ms, UTC) of the `interval` candle that contains `end` */
export function snapEnd(end: number, interval: string): number {
  // 🔐 Lookup on a fixed table; interval is already allow-listed by the route
  // eslint-disable-next-line security/detect-object-injection
  const fixed = FIXED_MS[interval];
  if (fixed !== undefined) return Math.floor(end / fixed) * fixed;
  if (interval === '1w') {
    const week = 7 * DAY_MS;
    return Math.floor((end - MONDAY_OFFSET_MS) / week) * week + MONDAY_OFFSET_MS;
  }
  // 1M: the first of the month
  const d = new Date(end);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** The candle length used to tell closed history from the still-moving present */
export function intervalMs(interval: string): number {
  // eslint-disable-next-line security/detect-object-injection
  return FIXED_MS[interval] ?? (interval === '1w' ? 7 * DAY_MS : 31 * DAY_MS);
}
