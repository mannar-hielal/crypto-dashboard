/**
 * Shared market constants — symbols list, interval definitions, bar-spacing, and fetch limits.
 * Imported by SymbolBar, PaneHeader, layoutStore, ChartPanel, and usePaneFeeds.
 */

export const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1M'] as const;
export type Interval = (typeof INTERVALS)[number];

export const INTERVAL_LABELS: Record<Interval, string> = {
  '1m': '1 Minute',
  '5m': '5 Minutes',
  '15m': '15 Minutes',
  '30m': '30 Minutes',
  '1h': '1 Hour',
  '2h': '2 Hours',
  '4h': '4 Hours',
  '1d': '1 Day',
  '1w': '1 Week',
  '1M': '1 Month',
};

/**
 * Initial bar spacing (px) applied on first chart load per interval.
 *
 * Candle bodies ~7–9 px wide, matching Bybit's/TradingView's default density:
 * at 3 px (the old 1m/5m value) bodies were ~2 px with visible spacing, so
 * the chart read as thin and gappy next to Bybit's.
 *
 * Reference viewport ~1 200 px → visible candles ≈ 1 200 / barSpacing
 *   1m  7 px → ~170 candles ≈  2.9 h
 *   5m  7 px → ~170 candles ≈ 14   h
 *   15m 7 px → ~170 candles ≈  1.8 days
 *   30m 7 px → ~170 candles ≈  3.5 days
 *   1h  7 px → ~170 candles ≈  7   days
 *   2h  7 px → ~170 candles ≈ 14   days
 *   4h  8 px → ~150 candles ≈ 25   days
 *   1d  9 px → ~130 candles ≈  4.4 months
 *   1w  8 px → ~150 candles ≈  2.9 years
 *   1M  8 px → ~150 candles (more than most symbols' full history)
 */
export const INTERVAL_BAR_SPACING: Record<Interval, number> = {
  '1m': 7,
  '5m': 7,
  '15m': 7,
  '30m': 7,
  '1h': 7,
  '2h': 7,
  '4h': 8,
  '1d': 9,
  '1w': 8,
  '1M': 8,
};

/**
 * Number of historical bars to fetch on initial load per interval.
 *
 * All intervals request the server maximum (1 000) for the deepest
 * possible scrollback buffer. The visible window on first open is
 * controlled by INTERVAL_BAR_SPACING, not the fetch count.
 *
 *   1m  1 000 bars → ~16.7 h of history
 *   5m  1 000 bars → ~3.5 days
 *   15m 1 000 bars → ~10.4 days
 *   30m 1 000 bars → ~20.8 days
 *   1h  1 000 bars → ~41.7 days
 *   2h  1 000 bars → ~83.3 days
 *   4h  1 000 bars → ~166  days (~5.5 months)
 *   1d  1 000 bars → ~2.7 years
 *   1w  1 000 bars → ~19.2 years
 *   1M  1 000 bars → ~83.3 years
 */
export const INTERVAL_FETCH_LIMIT: Record<Interval, number> = {
  '1m': 1000,
  '5m': 1000,
  '15m': 1000,
  '30m': 1000,
  '1h': 1000,
  '2h': 1000,
  '4h': 1000,
  '1d': 1000,
  '1w': 1000,
  '1M': 1000,
};

export interface SymbolEntry {
  symbol: string;
  base: string;
  label: string;
}

export const SYMBOLS: SymbolEntry[] = [
  { symbol: 'BTCUSDT', base: 'BTC', label: 'Bitcoin' },
  { symbol: 'ETHUSDT', base: 'ETH', label: 'Ethereum' },
  { symbol: 'SOLUSDT', base: 'SOL', label: 'Solana' },
  { symbol: 'BNBUSDT', base: 'BNB', label: 'BNB' },
  { symbol: 'XRPUSDT', base: 'XRP', label: 'XRP' },
  { symbol: 'DOGEUSDT', base: 'DOGE', label: 'Dogecoin' },
  { symbol: 'ADAUSDT', base: 'ADA', label: 'Cardano' },
  { symbol: 'AVAXUSDT', base: 'AVAX', label: 'Avalanche' },
  { symbol: 'LINKUSDT', base: 'LINK', label: 'Chainlink' },
];

/**
 * Time-range presets for the range switcher — mirrors TVP's preset list.
 *
 * Each preset adjusts the visible time window AND switches to a sensible
 * candle interval for that range. `seconds` is a thunk so YTD (year-to-date)
 * is computed dynamically at call time. Use `getPresetSeconds()` to evaluate.
 */
export const TIME_RANGE_PRESETS = [
  {
    key: '1D',
    label: '1D',
    title: '1 day in 1 min interval',
    seconds: () => 86_400,
    interval: '1m',
  },
  {
    key: '5D',
    label: '5D',
    title: '5 days in 5 min interval',
    seconds: () => 432_000,
    interval: '5m',
  },
  {
    key: '1M',
    label: '1M',
    title: '1 month in 30 min interval',
    seconds: () => 2_592_000,
    interval: '30m',
  },
  {
    key: '3M',
    label: '3M',
    title: '3 months in 1 hour interval',
    seconds: () => 7_776_000,
    interval: '1h',
  },
  {
    key: '6M',
    label: '6M',
    title: '6 months in 2 hour interval',
    seconds: () => 15_552_000,
    interval: '2h',
  },
  {
    key: 'YTD',
    label: 'YTD',
    title: 'year to date in 1 day interval',
    seconds: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return Math.floor((now.getTime() - start.getTime()) / 1000);
    },
    interval: '1d',
  },
  {
    key: '1Y',
    label: '1Y',
    title: '1 year in 1 day interval',
    seconds: () => 31_536_000,
    interval: '1d',
  },
  {
    key: '5Y',
    label: '5Y',
    title: '5 years in 1 week interval',
    seconds: () => 157_680_000,
    interval: '1w',
  },
  {
    key: 'ALL',
    label: 'ALL',
    title: 'all data in 1 month interval',
    seconds: () => Infinity,
    interval: '1M',
  },
] as const;

export type TimeRangePreset = (typeof TIME_RANGE_PRESETS)[number]['key'];

export function getPresetSeconds(preset: TimeRangePreset): number | typeof Infinity {
  const p = TIME_RANGE_PRESETS.find((pr) => pr.key === preset);
  return p ? p.seconds() : 0;
}

/**
 * Quantity precision (decimal places) per symbol — mirrors Bybit Spot lot sizes.
 * Used to floor raw qty to the exchange minimum step, matching TVP's
 * "trade value" calculation (input USD → floor qty → actual filled value).
 *
 * Example: 100 USD at 74,825 → raw 0.001337 BTC → floor to 4dp → 0.0013 BTC
 *          → actual trade value = 0.0013 × 74,825 = 97.27 USD  (matches TV)
 */
export const SYMBOL_QTY_DECIMALS: Record<string, number> = {
  BTCUSDT: 4, // 0.0001 BTC step
  ETHUSDT: 3, // 0.001  ETH step
  SOLUSDT: 2, // 0.01   SOL step
  BNBUSDT: 2, // 0.01   BNB step
  XRPUSDT: 1, // 0.1    XRP step
  DOGEUSDT: 0, // 1      DOGE step
  ADAUSDT: 0, // 1      ADA step
  AVAXUSDT: 1, // 0.1    AVAX step
  LINKUSDT: 1, // 0.1    LINK step
};

/** Default precision for any symbol not in the map. */
const DEFAULT_QTY_DECIMALS = 4;

/**
 * Floor a raw qty to the symbol's lot-size step.
 *
 * @param qty   Raw quantity in base-asset units
 * @param symbol  e.g. "BTCUSDT"
 * @returns Quantity truncated down to the nearest valid lot
 */
export function floorToLot(qty: number, symbol: string): number {
  const decimals = SYMBOL_QTY_DECIMALS[symbol] ?? DEFAULT_QTY_DECIMALS;
  const factor = Math.pow(10, decimals);
  return Math.floor(qty * factor) / factor;
}
