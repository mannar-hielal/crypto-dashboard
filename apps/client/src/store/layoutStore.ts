/**
 * Layout Store
 *
 * Owns the multi-chart layout configuration:
 *   - Which layout is active (1 / 2h / 2v / 3h / 4)
 *   - Which pane is "active" (receives SymbolBar controls + TradingPanel)
 *   - Per-pane symbol + interval config (up to 4 panes)
 *   - Sync options: which axes are mirrored across all panes
 *
 * Persisted to localStorage under "cd-layout".
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LayoutId = '1' | '2h' | '2v' | '3h' | '4';

export interface PaneConfig {
  symbol: string;
  interval: string;
}

export interface SyncOptions {
  /** All panes switch to the same symbol when any one changes */
  symbol: boolean;
  /** All panes switch to the same interval when any one changes */
  interval: boolean;
  /** Crosshair position (time axis) is mirrored across all panes */
  crosshair: boolean;
  /** Visible time range is kept in sync across all panes */
  timeRange: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** How many chart panes each layout uses */
export const LAYOUT_PANE_COUNT: Record<LayoutId, number> = {
  '1': 1,
  '2h': 2,
  '2v': 2,
  '3h': 3,
  '4': 4,
};

/** Tailwind grid classes for each layout */
export const LAYOUT_GRID_CLASS: Record<LayoutId, string> = {
  '1': 'grid-cols-1 grid-rows-1',
  '2h': 'grid-cols-2 grid-rows-1',
  '2v': 'grid-cols-1 grid-rows-2',
  '3h': 'grid-cols-3 grid-rows-1',
  '4': 'grid-cols-2 grid-rows-2',
};

/** Default symbol/interval for each pane slot */
const DEFAULT_PANES: PaneConfig[] = [
  { symbol: 'BTCUSDT', interval: '1m' },
  { symbol: 'ETHUSDT', interval: '1m' },
  { symbol: 'SOLUSDT', interval: '1m' },
  { symbol: 'BNBUSDT', interval: '1m' },
];

// ─── Store ────────────────────────────────────────────────────────────────────

interface LayoutState {
  layout: LayoutId;
  activePane: number;
  panes: PaneConfig[];
  syncOptions: SyncOptions;

  setLayout: (layout: LayoutId) => void;
  setActivePane: (index: number) => void;
  setPaneSymbol: (paneIndex: number, symbol: string) => void;
  setPaneInterval: (paneIndex: number, interval: string) => void;
  toggleSync: (key: keyof SyncOptions) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      layout: '1',
      activePane: 0,
      panes: DEFAULT_PANES,
      syncOptions: {
        symbol: false,
        interval: false,
        crosshair: true,
        timeRange: true,
      },

      setLayout: (layout) => {
        const count = LAYOUT_PANE_COUNT[layout];
        const { activePane } = get();
        // Clamp activePane to new pane count
        set({ layout, activePane: activePane >= count ? 0 : activePane });
      },

      setActivePane: (index) => set({ activePane: index }),

      setPaneSymbol: (paneIndex, symbol) => {
        const { panes, syncOptions } = get();
        if (syncOptions.symbol) {
          set({ panes: panes.map((p) => ({ ...p, symbol })) });
        } else {
          const updated = [...panes];
          updated[paneIndex] = { ...updated[paneIndex], symbol };
          set({ panes: updated });
        }
      },

      setPaneInterval: (paneIndex, interval) => {
        const { panes, syncOptions } = get();
        if (syncOptions.interval) {
          set({ panes: panes.map((p) => ({ ...p, interval })) });
        } else {
          const updated = [...panes];
          updated[paneIndex] = { ...updated[paneIndex], interval };
          set({ panes: updated });
        }
      },

      toggleSync: (key) => {
        const { syncOptions } = get();
        set({ syncOptions: { ...syncOptions, [key]: !syncOptions[key] } });
      },
    }),
    { name: 'cd-layout', version: 1 }
  )
);

