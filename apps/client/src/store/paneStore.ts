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

const MAX_BARS = 500;

// ─── State shape ─────────────────────────────────────────────────────────────

export interface PaneMarketState {
  bars: CandleBar[];
  indicators: IndicatorSnapshot | null;
  latestPrice: number | null;
  priceChange: number | null;
  isConnected: boolean;

  setSnapshot: (bars: CandleBar[], indicators: IndicatorSnapshot | null) => void;
  addBar: (liveBar: LiveBar) => void;
  setConnected: (connected: boolean) => void;
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
      let updatedBars: CandleBar[];

      if (last && last.timestamp === incomingKline.timestamp) {
        updatedBars = [...bars.slice(0, -1), incomingKline];
      } else {
        updatedBars = [...bars, incomingKline];
        if (updatedBars.length > MAX_BARS) updatedBars = updatedBars.slice(-MAX_BARS);
      }

      const priceChange =
        updatedBars.length >= 2
          ? incomingKline.close - (updatedBars[updatedBars.length - 2]?.close ?? incomingKline.close)
          : null;

      set({
        bars: updatedBars,
        indicators: liveBar.indicators,
        latestPrice: incomingKline.close,
        priceChange,
      });
    },

    setConnected: (isConnected) => set({ isConnected }),

    reset: () =>
      set({ bars: [], indicators: null, latestPrice: null, priceChange: null, isConnected: false }),
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

