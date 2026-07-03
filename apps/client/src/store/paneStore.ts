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
import type { CandleBar, IndicatorSnapshot, LiveBar } from '@crypto-dashboard/sdk';

const MAX_BARS = 1000;

/**
 * Global map of the last known price for each symbol.
 * Updated by every pane feed, never cleared on pane reset.
 * Used as a fallback so positions retain their mark price
 * after switching away from a symbol.
 */
export const lastKnownPrices = new Map<string, number>();

// ─── State shape ─────────────────────────────────────────────────────────────

export interface PaneMarketState {
  bars: CandleBar[];
  indicators: IndicatorSnapshot | null;
  latestPrice: number | null;
  priceChange: number | null;
  isConnected: boolean;
  /** Best bid price from orderbook.1 stream */
  bid: number | null;
  /** Best ask price from orderbook.1 stream */
  ask: number | null;
  /** Becomes true when the first WS snapshot message lands on this pane.
   *  Reset to false on every reset() / interval change. */
  wsSnapshotReceived: boolean;

  setSnapshot: (bars: CandleBar[], indicators: IndicatorSnapshot | null) => void;
  addBar: (liveBar: LiveBar) => void;
  setConnected: (connected: boolean) => void;
  setBidAsk: (bid: number, ask: number, lastPrice?: number) => void;
  setWsSnapshotReceived: (v: boolean) => void;
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
    wsSnapshotReceived: false,

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

    addBar: (liveBar) => {
      const { bars } = get();
      const incomingKline = liveBar.kline;
      const last = bars[bars.length - 1];
      let updatedBars: CandleBar[];

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

    setBidAsk: (bid, ask, lastPrice) =>
      set((s) => {
        // If no lastPrice was provided, only update bid/ask; leave latestPrice and
        // priceChange untouched so the direction indicator stays consistent.
        if (lastPrice == null) {
          return { bid, ask };
        }

        // Recompute priceChange relative to the previous confirmed candle close
        // so that latestPrice = previousClose + priceChange invariant holds.
        const previousClose =
          s.bars.length >= 2 ? (s.bars[s.bars.length - 2]?.close ?? null) : null;

        return {
          bid,
          ask,
          latestPrice: lastPrice,
          priceChange: previousClose == null ? s.priceChange : lastPrice - previousClose,
        };
      }),

    setWsSnapshotReceived: (v) => set({ wsSnapshotReceived: v }),

    reset: () =>
      set({
        bars: [],
        indicators: null,
        latestPrice: null,
        priceChange: null,
        isConnected: false,
        bid: null,
        ask: null,
        wsSnapshotReceived: false,
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
