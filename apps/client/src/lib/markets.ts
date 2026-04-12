/**
 * Shared market constants — symbols list and interval definitions.
 * Imported by SymbolBar, PaneHeader, and layoutStore default config.
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

