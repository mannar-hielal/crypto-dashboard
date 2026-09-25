import type {
  CandleHistoryResponse,
  InstrumentsResponse,
  MarketCategory,
  RiskLimitResponse,
} from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

// ─── Market API ───────────────────────────────────────────────────────────────

export const marketApi = {
  /**
   * Fetch historical OHLCV candles for initial chart load.
   * @param symbol - e.g. 'BTCUSDT'
   * @param interval - e.g. '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
   * @param limit - number of candles to return (max 1000)
   * @param category - Bybit market: 'spot' (default) or 'linear' (USDT Perpetual)
   */
  getCandles: (
    symbol = 'BTCUSDT',
    interval = '1m',
    limit = 200,
    category: MarketCategory = 'spot'
  ) =>
    fetch(
      `${BASE_URL}/api/market/candles?category=${category}&symbol=${symbol}&interval=${interval}&limit=${limit}`,
      { signal: AbortSignal.timeout(10_000) }
    ).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<CandleHistoryResponse>;
    }),

  /** Trading rules (tick size, qty step, min size, max leverage) for every symbol in a market. */
  getInstruments: (category: MarketCategory = 'spot') =>
    fetch(`${BASE_URL}/api/market/instruments?category=${category}`, {
      signal: AbortSignal.timeout(10_000),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<InstrumentsResponse>;
    }),

  /** Risk-limit (maintenance margin) tiers of a USDT Perpetual symbol. */
  getRiskLimit: (symbol: string) =>
    fetch(`${BASE_URL}/api/market/risk-limit?symbol=${symbol}`, {
      signal: AbortSignal.timeout(10_000),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<RiskLimitResponse>;
    }),

  /**
   * Returns the WebSocket URL for the live price feed.
   * Usage: const ws = new WebSocket(marketApi.wsUrl('BTCUSDT', '1m', 'spot'))
   */
  wsUrl: (symbol = 'BTCUSDT', interval = '1m', category: MarketCategory = 'spot'): string => {
    const base = BASE_URL.replace(/^http/, 'ws'); // http → ws, https → wss
    return `${base}/api/market/ws?category=${category}&symbol=${symbol}&interval=${interval}`;
  },
};
