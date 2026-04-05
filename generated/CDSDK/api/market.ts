import type { CandleHistoryResponse } from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

// ─── Market API ───────────────────────────────────────────────────────────────

export const marketApi = {
  /**
   * Fetch historical OHLCV candles for initial chart load.
   * @param symbol - e.g. 'BTCUSDT'
   * @param interval - e.g. '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
   * @param limit - number of candles to return (max 1000)
   */
  getCandles: (symbol = 'BTCUSDT', interval = '1m', limit = 200) =>
    fetch(
      `${BASE_URL}/api/market/candles?symbol=${symbol}&interval=${interval}&limit=${limit}`
    ).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<CandleHistoryResponse>;
    }),

  /**
   * Returns the WebSocket URL for the live price feed.
   * Usage: const ws = new WebSocket(marketApi.wsUrl('BTCUSDT', '1m'))
   */
  wsUrl: (symbol = 'BTCUSDT', interval = '1m'): string => {
    const base = BASE_URL.replace(/^http/, 'ws'); // http → ws, https → wss
    return `${base}/api/market/ws?symbol=${symbol}&interval=${interval}`;
  },
};
