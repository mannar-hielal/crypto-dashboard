/**
 * Layout Store
 *
 * Owns the multi-chart layout configuration:
 *   - Which layout is active (1 / 2h / 2v / 3h / 4)
 *   - Which pane is "active" (receives SymbolBar controls + TradingPanel)
 *   - Per-pane symbol + interval config (up to 4 panes)
 *   - Sync options: which axes are mirrored across all panes
 *   - Per-layout pane size fractions (drag-to-resize)
 *
 * Persisted to localStorage under "cd-layout".
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  SYMBOLS,
  INTERVALS,
  TIME_RANGE_PRESETS,
  type Interval,
  type TimeRangePreset,
} from '@/lib/markets';
import type { IndicatorInstance } from '@/lib/indicators/types';
import { createDefaultIndicatorInstances } from '@/lib/indicators/catalog';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LayoutId = '1' | '2h' | '2v' | '3h' | '4';

const MAX_INDICATORS_PER_PANE = 50;

export interface PaneConfig {
  symbol: string;
  interval: Interval;
  timeRangePreset: TimeRangePreset | null;
  indicators: IndicatorInstance[];
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

/** Column and row fractional sizes for a layout (each axis sums to 1.0) */
export interface PaneSizes {
  colFracs: number[];
  rowFracs: number[];
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

/** Tailwind grid classes for each layout (kept for reference) */
export const LAYOUT_GRID_CLASS: Record<LayoutId, string> = {
  '1': 'grid-cols-1 grid-rows-1',
  '2h': 'grid-cols-2 grid-rows-1',
  '2v': 'grid-cols-1 grid-rows-2',
  '3h': 'grid-cols-3 grid-rows-1',
  '4': 'grid-cols-2 grid-rows-2',
};

/** Default equal-split pane sizes per layout */
export const DEFAULT_PANE_SIZES: Record<LayoutId, PaneSizes> = {
  '1': { colFracs: [1], rowFracs: [1] },
  '2h': { colFracs: [0.5, 0.5], rowFracs: [1] },
  '2v': { colFracs: [1], rowFracs: [0.5, 0.5] },
  '3h': { colFracs: [1 / 3, 1 / 3, 1 / 3], rowFracs: [1] },
  '4': { colFracs: [0.5, 0.5], rowFracs: [0.5, 0.5] },
};

/** Default symbol/interval/indicators for each pane slot */
const DEFAULT_PANES: PaneConfig[] = [
  {
    symbol: SYMBOLS[0].symbol,
    interval: INTERVALS[0],
    timeRangePreset: null,
    indicators: createDefaultIndicatorInstances(),
  }, // BTCUSDT, 1m
  { symbol: SYMBOLS[1].symbol, interval: INTERVALS[0], timeRangePreset: null, indicators: [] }, // ETHUSDT, 1m
  { symbol: SYMBOLS[2].symbol, interval: INTERVALS[0], timeRangePreset: null, indicators: [] }, // SOLUSDT, 1m
  { symbol: SYMBOLS[3].symbol, interval: INTERVALS[0], timeRangePreset: null, indicators: [] }, // BNBUSDT, 1m
];

// ─── Store ────────────────────────────────────────────────────────────────────

interface LayoutState {
  layout: LayoutId;
  activePane: number;
  panes: PaneConfig[];
  syncOptions: SyncOptions;
  /** Per-layout drag-resized pane fractions — persisted */
  paneSizes: Record<LayoutId, PaneSizes>;
  /** Committed height (px) of the bottom panel after drag-to-resize — persisted */
  bottomPanelHeight: number;

  setLayout: (layout: LayoutId) => void;
  setActivePane: (index: number) => void;
  setPaneSymbol: (paneIndex: number, symbol: string) => void;
  setPaneInterval: (paneIndex: number, interval: Interval) => void;
  setPaneTimeRangePreset: (paneIndex: number, preset: TimeRangePreset | null) => void;
  addIndicator: (paneIndex: number, instance: IndicatorInstance) => void;
  removeIndicator: (paneIndex: number, instanceId: string) => void;
  updateIndicator: (
    paneIndex: number,
    instanceId: string,
    patch: Partial<IndicatorInstance>
  ) => void;
  setIndicatorPosition: (
    paneIndex: number,
    instanceId: string,
    position: { x: number; y: number }
  ) => void;
  toggleSync: (key: keyof SyncOptions) => void;
  setPaneSizes: (layout: LayoutId, sizes: PaneSizes) => void;
  setBottomPanelHeight: (height: number) => void;
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
      paneSizes: { ...DEFAULT_PANE_SIZES },
      bottomPanelHeight: 208,

      setLayout: (layout) => {
        const count = LAYOUT_PANE_COUNT[layout];
        const { activePane } = get();
        set({ layout, activePane: activePane >= count ? count - 1 : activePane });
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

      setPaneTimeRangePreset: (paneIndex, preset) => {
        const { panes } = get();
        const updated = [...panes];
        updated[paneIndex] = { ...updated[paneIndex], timeRangePreset: preset };
        set({ panes: updated });
      },

      toggleSync: (key) => {
        const { syncOptions, panes, activePane } = get();
        const turningOn = !syncOptions[key];
        const newSyncOptions = { ...syncOptions, [key]: turningOn };

        // When enabling symbol or interval sync, immediately snap all panes to
        // the active pane's value. Active pane wins — it is the chart the user
        // is currently focused on, making it the most intuitive source of truth
        // (mirrors the behaviour of TVP / Bookmap multi-chart sync).
        if (turningOn && key === 'symbol') {
          const sourceSymbol = (panes[activePane] ?? DEFAULT_PANES[0]).symbol;
          set({
            syncOptions: newSyncOptions,
            panes: panes.map((p) => ({ ...p, symbol: sourceSymbol })),
          });
          return;
        }
        if (turningOn && key === 'interval') {
          const sourceInterval = (panes[activePane] ?? DEFAULT_PANES[0]).interval;
          set({
            syncOptions: newSyncOptions,
            panes: panes.map((p) => ({ ...p, interval: sourceInterval })),
          });
          return;
        }

        set({ syncOptions: newSyncOptions });
      },

      addIndicator: (paneIndex, instance) =>
        set((s) => {
          const panes = [...s.panes];
          panes[paneIndex] = {
            ...panes[paneIndex],
            indicators: [...panes[paneIndex].indicators, instance].slice(
              0,
              MAX_INDICATORS_PER_PANE
            ),
          };
          return { panes };
        }),

      removeIndicator: (paneIndex, instanceId) =>
        set((s) => {
          const panes = [...s.panes];
          panes[paneIndex] = {
            ...panes[paneIndex],
            indicators: panes[paneIndex].indicators.filter(
              (inst) => inst.instanceId !== instanceId
            ),
          };
          return { panes };
        }),

      updateIndicator: (paneIndex, instanceId, patch) =>
        set((s) => {
          const panes = [...s.panes];
          panes[paneIndex] = {
            ...panes[paneIndex],
            indicators: panes[paneIndex].indicators.map((inst) =>
              inst.instanceId === instanceId ? { ...inst, ...patch } : inst
            ),
          };
          return { panes };
        }),

      setIndicatorPosition: (paneIndex, instanceId, position) =>
        set((s) => {
          const panes = [...s.panes];
          panes[paneIndex] = {
            ...panes[paneIndex],
            indicators: panes[paneIndex].indicators.map((inst) =>
              inst.instanceId === instanceId ? { ...inst, position } : inst
            ),
          };
          return { panes };
        }),

      setPaneSizes: (layout, sizes) =>
        set((s) => ({ paneSizes: { ...s.paneSizes, [layout]: sizes } })),

      setBottomPanelHeight: (height) => set({ bottomPanelHeight: height }),
    }),
    {
      name: 'cd-layout',
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        // v1 → v2: add indicators to panes
        if (version < 2) {
          const panes = state.panes as Array<Record<string, unknown>> | undefined;
          if (panes) {
            state.panes = panes.map((pane, i) => ({
              ...pane,
              indicators: pane.indicators ?? (i === 0 ? createDefaultIndicatorInstances() : []),
            }));
          }
        }
        return state as unknown as LayoutState;
      },
      // Clamp activePane on hydration: persisted state could have an activePane
      // that is out of range for the persisted layout if the layout was changed
      // between sessions without going through setLayout (e.g. manual storage
      // edit, future schema migration). merge() runs before the state is applied.
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<LayoutState>),
        } as LayoutState;
        const count = LAYOUT_PANE_COUNT[merged.layout] ?? 1;
        if (merged.activePane >= count) merged.activePane = count - 1;
        // Ensure panes always has exactly 4 entries — a corrupted / older
        // localStorage payload could have fewer, causing out-of-bounds reads
        // in toggleSync, MultiChartArea, and usePaneFeeds.
        if (!Array.isArray(merged.panes) || merged.panes.length < 4) {
          const existing = Array.isArray(merged.panes) ? merged.panes : [];
          merged.panes = DEFAULT_PANES.map((def, i) => {
            const saved = existing[i];
            if (!saved) return def;
            // Validate interval is a known value; fall back to default otherwise
            const interval = INTERVALS.includes(saved.interval as Interval)
              ? (saved.interval as Interval)
              : def.interval;
            const timeRangePreset =
              saved.timeRangePreset !== undefined &&
              TIME_RANGE_PRESETS.some((p) => p.key === saved.timeRangePreset)
                ? (saved.timeRangePreset as TimeRangePreset)
                : null;
            return {
              symbol: saved.symbol ?? def.symbol,
              interval,
              timeRangePreset,
              indicators: saved.indicators ?? (i === 0 ? createDefaultIndicatorInstances() : []),
            };
          }) as [PaneConfig, PaneConfig, PaneConfig, PaneConfig];
        }
        // Ensure paneSizes is present and has all layout IDs (added after v1)
        if (!merged.paneSizes || typeof merged.paneSizes !== 'object') {
          merged.paneSizes = { ...DEFAULT_PANE_SIZES };
        } else {
          for (const lid of Object.keys(DEFAULT_PANE_SIZES) as LayoutId[]) {
            if (!merged.paneSizes[lid]) merged.paneSizes[lid] = DEFAULT_PANE_SIZES[lid];
          }
        }
        // Ensure bottomPanelHeight is a valid number (field added after initial release)
        if (typeof merged.bottomPanelHeight !== 'number' || merged.bottomPanelHeight < 80) {
          merged.bottomPanelHeight = 208;
        }
        // Ensure all panes have indicators array (v2+ field)
        for (let i = 0; i < merged.panes.length; i++) {
          if (!merged.panes[i].indicators) {
            merged.panes[i].indicators = i === 0 ? createDefaultIndicatorInstances() : [];
          }
        }
        return merged;
      },
    }
  )
);
