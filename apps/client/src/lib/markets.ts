/**
 * Shared market constants — symbols list, interval definitions, bar-spacing, and fetch limits.
 * Imported by SymbolBar, PaneHeader, layoutStore, ChartPanel, and usePaneFeeds.
 */

export const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type Interval = (typeof INTERVALS)[number];

export const INTERVAL_LABELS: Record<Interval, string> = {
  '1m': '1 Minute',
  '5m': '5 Minutes',
  '15m': '15 Minutes',
  '1h': '1 Hour',
  '4h': '4 Hours',
  '1d': '1 Day',
};

/**
 * Initial bar spacing (px) applied on first chart load per interval.
 *
 * Targets ~160–200 visible candles in a typical 1 200 px viewport —
 * matching TradingView's default zoom density. Lower timeframes use a
 * tighter spacing so they show a meaningful slice of recent history;
 * the daily bar is slightly wider to keep individual candles readable.
 *
 * Reference viewport ~1 200 px → visible candles ≈ 1 200 / barSpacing
 *   1m  6 px → ~200 candles ≈  3.3 h
 *   5m  6 px → ~200 candles ≈ 16.7 h
 *   15m 6 px → ~200 candles ≈  2.1 days
 *   1h  6 px → ~200 candles ≈  8.3 days
 *   4h  6 px → ~200 candles ≈  33 days (~1 month)
 *   1d  8 px → ~150 candles ≈   5 months
 */
export const INTERVAL_BAR_SPACING: Record<Interval, number> = {
  '1m': 6,
  '5m': 6,
  '15m': 6,
  '1h': 6,
  '4h': 6,
  '1d': 8,
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
 *   1h  1 000 bars → ~41.7 days
 *   4h  1 000 bars → ~166 days (~5.5 months)
 *   1d  1 000 bars → ~2.7 years
 */
export const INTERVAL_FETCH_LIMIT: Record<Interval, number> = {
  '1m': 1000,
  '5m': 1000,
  '15m': 1000,
  '1h': 1000,
  '4h': 1000,
  '1d': 1000,
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
