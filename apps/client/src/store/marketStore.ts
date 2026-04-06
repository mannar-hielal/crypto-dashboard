/**
 * Market Store (Zustand)
 *
 * Holds live candle data and indicator values for the active symbol/interval.
 * Fed by two sources:
 *   1. REST fetch on mount (historical snapshot via marketApi.getCandles)
 *   2. WebSocket updates (live bars via usePriceFeed hook)
 */

import { create } from 'zustand';
import type { CandleBar, IndicatorSnapshot, LiveBar } from '@crypto-dashboard/sdk';

// How many bars to keep in memory (prevents unbounded growth)
const MAX_BARS = 500;

interface MarketState {
  // ── Data ──────────────────────────────────────────────────────────────────
  bars: CandleBar[];
  // Latest indicator values (from the most recent bar)
  indicators: IndicatorSnapshot | null;
  // Latest close price
  latestPrice: number | null;
  // Price change vs the previous closed bar (raw value, not %)
  priceChange: number | null;

  // ── Subscription params ───────────────────────────────────────────────────
  symbol: string;
  interval: string;

  // ── Connection status ─────────────────────────────────────────────────────
  isConnected: boolean;

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Replace all bars at once (called after REST fetch or WS snapshot) */
  setSnapshot: (bars: CandleBar[], indicators: IndicatorSnapshot | null) => void;

  /** Upsert one bar — appends if new timestamp, updates last bar if same timestamp */
  addBar: (liveBar: LiveBar) => void;

  setConnected: (connected: boolean) => void;
  setSymbol: (symbol: string) => void;
  setInterval: (interval: string) => void;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  bars: [],
  indicators: null,
  latestPrice: null,
  priceChange: null,
  symbol: 'BTCUSDT',
  interval: '1m',
  isConnected: false,

  setSnapshot: (bars, indicators) => {
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    set({
      bars: bars.slice(-MAX_BARS),
      indicators,
      latestPrice: last?.close ?? null,
      priceChange: last && prev ? last.close - prev.close : null,
    });
  },

  addBar: (liveBar) => {
    const { bars } = get();
    const incomingKline = liveBar.kline;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];

    let updatedBars: CandleBar[];

    if (last && last.timestamp === incomingKline.timestamp) {
      // Same candle — update the forming bar in-place (keeps the chart smooth)
      updatedBars = [...bars.slice(0, -1), incomingKline];
    } else {
      // New candle — append and cap the array
      updatedBars = [...bars, incomingKline];
      if (updatedBars.length > MAX_BARS) updatedBars = updatedBars.slice(-MAX_BARS);
    }

    const priceChange =
      updatedBars.length >= 2
        ? incomingKline.close - (updatedBars[updatedBars.length - 2]?.close ?? incomingKline.close)
        : prev
          ? incomingKline.close - prev.close
          : null;

    set({
      bars: updatedBars,
      indicators: liveBar.indicators,
      latestPrice: incomingKline.close,
      priceChange,
    });
  },

  setConnected: (isConnected) => set({ isConnected }),
  setSymbol: (symbol) =>
    set({ symbol, bars: [], indicators: null, latestPrice: null, priceChange: null }),
  setInterval: (interval) =>
    set({ interval, bars: [], indicators: null, latestPrice: null, priceChange: null }),
}));
