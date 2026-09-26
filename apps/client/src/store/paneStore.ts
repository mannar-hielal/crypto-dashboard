/**
 * Pane Market Stores
 *
 * Four independent vanilla Zustand stores — one per chart pane.
 * Each holds its own bars, price, and connection state.
 * Fed by usePaneFeeds (one WebSocket connection per active pane).
 *
 * Use via `useStore(paneStores[i], selector)` in React components.
 */

import { createStore } from 'zustand';
import type {
  CandleBar,
  IndicatorSnapshot,
  LiveBar,
  MarketCategory,
  TickerMessage,
} from '@crypto-dashboard/sdk';

const MAX_BARS = 1000;

/**
 * Global map of the last known price per market + symbol, keyed `category:symbol` — spot and
 * perp prices differ, so they're kept apart (BYBIT_PARITY_PLAN BP-0).
 * Updated by every pane feed, never cleared on pane reset.
 * Used as a fallback so positions retain their mark price
 * after switching away from a symbol. Bounded: 2 categories × 9 symbols.
 * Read/write through getLastKnownPrice / setLastKnownPrice.
 */
export const lastKnownPrices = new Map<string, number>();

export function setLastKnownPrice(category: MarketCategory, symbol: string, price: number): void {
  lastKnownPrices.set(`${category}:${symbol}`, price);
}

/**
 * Positions carry no category until BP-2; they trade at spot prices today, so spot is the
 * default.
 */
export function getLastKnownPrice(
  symbol: string,
  category: MarketCategory = 'spot'
): number | undefined {
  return lastKnownPrices.get(`${category}:${symbol}`);
}

// ─── State shape ─────────────────────────────────────────────────────────────

export interface PaneMarketState {
  bars: CandleBar[];
  indicators: IndicatorSnapshot | null;
  latestPrice: number | null;
  priceChange: number | null;
  isConnected: boolean;
  /** Best bid (spot: orderbook.1, linear: tickers) */
  bid: number | null;
  /** Best ask (spot: orderbook.1, linear: tickers) */
  ask: number | null;
  /** USDT Perpetual only — null on spot panes */
  markPrice: number | null;
  indexPrice: number | null;
  fundingRate: number | null;
  /** Unix ms of the next funding settlement */
  nextFundingTime: number | null;
  /** Becomes true when the first WS snapshot message lands on this pane.
   *  Reset to false on every reset() / interval change. */
  wsSnapshotReceived: boolean;
  /** True once the REST history fetch for the CURRENT symbol/interval has
   *  succeeded. Until then `bars` may be the previous symbol's candles or the
   *  WS cold-aggregator snapshot (a partial history whose length grows with
   *  server uptime). MultiChartArea only lets a pane drive time-range sync
   *  once this is true. Reset on reset() and on every symbol/interval change. */
  historyLoaded: boolean;

  /** True when the user has manually zoomed this pane via the zoom-in tool.
   *  MultiChartArea time-range sync skips zoomed panes to prevent
   *  other panes' setData+restore cycles from overriding the user's view. */
  userZoomed: boolean;

  setSnapshot: (bars: CandleBar[], indicators: IndicatorSnapshot | null) => void;
  setIndicators: (indicators: IndicatorSnapshot | null) => void;
  addBar: (liveBar: LiveBar) => void;
  setConnected: (connected: boolean) => void;
  /** Apply a `ticker` WS message. A null bid/ask keeps the last known side. */
  setTicker: (ticker: TickerMessage) => void;
  setWsSnapshotReceived: (v: boolean) => void;
  setHistoryLoaded: (v: boolean) => void;
  setUserZoomed: (v: boolean) => void;
  /** Wipe all data — called before a new symbol/interval connects */
  reset: () => void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function createPaneStore() {
  return createStore<PaneMarketState>((set, get) => ({
    bars: [],
    indicators: null,
    latestPrice: null,
    priceChange: null,
    isConnected: false,
    bid: null,
    ask: null,
    markPrice: null,
    indexPrice: null,
    fundingRate: null,
    nextFundingTime: null,
    wsSnapshotReceived: false,
    historyLoaded: false,
    userZoomed: false,

    setSnapshot: (bars, indicators) => {
      // Deduplicate by timestamp (keep last occurrence) then sort ascending.
      // lightweight-charts requires strictly ascending time order.
      const dedupMap = new Map<number, CandleBar>();
      for (const b of bars) dedupMap.set(b.timestamp, b);
      const sorted = Array.from(dedupMap.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-MAX_BARS);
      const last = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      set({
        bars: sorted,
        indicators,
        latestPrice: last?.close ?? null,
        priceChange: last && prev ? last.close - prev.close : null,
      });
    },

    setIndicators: (indicators) => set({ indicators }),

    addBar: (liveBar) => {
      const { bars } = get();
      const incomingKline = liveBar.kline;
      const last = bars[bars.length - 1];
      let updatedBars: CandleBar[];

      // 🔐 Reject out-of-order ticks — a delayed WS message with an older
      //    timestamp appended at the end breaks lightweight-charts' strictly
      //    ascending time requirement (same invariant setSnapshot sorts by).
      if (last && incomingKline.timestamp < last.timestamp) return;

      if (last && last.timestamp === incomingKline.timestamp) {
        updatedBars = [...bars.slice(0, -1), incomingKline];
      } else {
        updatedBars = [...bars, incomingKline];
        if (updatedBars.length > MAX_BARS) updatedBars = updatedBars.slice(-MAX_BARS);
      }

      const priceChange =
        updatedBars.length >= 2
          ? incomingKline.close -
            (updatedBars[updatedBars.length - 2]?.close ?? incomingKline.close)
          : null;

      set({
        bars: updatedBars,
        indicators: liveBar.indicators,
        latestPrice: incomingKline.close,
        priceChange,
      });
    },

    setConnected: (isConnected) => set({ isConnected }),

    setTicker: (ticker) =>
      set((s) => {
        // Recompute priceChange relative to the previous confirmed candle close
        // so that latestPrice = previousClose + priceChange invariant holds.
        const previousClose =
          s.bars.length >= 2 ? (s.bars[s.bars.length - 2]?.close ?? null) : null;

        return {
          // Spot bid/ask stay null until the first orderbook.1 update — keep the last known side
          bid: ticker.bid ?? s.bid,
          ask: ticker.ask ?? s.ask,
          latestPrice: ticker.lastPrice,
          priceChange: previousClose == null ? s.priceChange : ticker.lastPrice - previousClose,
          markPrice: ticker.markPrice ?? null,
          indexPrice: ticker.indexPrice ?? null,
          fundingRate: ticker.fundingRate ?? null,
          nextFundingTime: ticker.nextFundingTime ?? null,
        };
      }),

    setWsSnapshotReceived: (v) => set({ wsSnapshotReceived: v }),

    setHistoryLoaded: (v) => set({ historyLoaded: v }),

    setUserZoomed: (v) => set({ userZoomed: v }),

    reset: () =>
      set({
        bars: [],
        indicators: null,
        latestPrice: null,
        priceChange: null,
        isConnected: false,
        bid: null,
        ask: null,
        markPrice: null,
        indexPrice: null,
        fundingRate: null,
        nextFundingTime: null,
        wsSnapshotReceived: false,
        historyLoaded: false,
        userZoomed: false,
      }),
  }));
}

// ─── Four stores — one per pane slot ─────────────────────────────────────────

export const paneStores = [
  createPaneStore(), // pane 0 — primary trading pane
  createPaneStore(), // pane 1
  createPaneStore(), // pane 2
  createPaneStore(), // pane 3
] as const;

export type PaneStore = ReturnType<typeof createPaneStore>;
