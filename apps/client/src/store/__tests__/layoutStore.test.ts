/**
 * layoutStore tests
 *
 * Tests cover the non-trivial store behaviours that are most likely to regress:
 *   - setLayout(): activePane clamped to count-1 (not reset to 0) when out of range
 *   - setPaneSymbol(): single-pane update vs. sync.symbol broadcast
 *   - setPaneInterval(): single-pane update vs. sync.interval broadcast
 *   - toggleSync(): toggles individual sync flags + snap-on-enable for symbol/interval
 *   - setPaneChartType() + persisted chartType migration/validation (v3)
 *   - setPaneCategory() + category sync + persisted category migration/validation (v4)
 *   - setPaneMarket() (atomic market + symbol) and the D7 hand-off flag (v5)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore, type PaneConfig } from '../layoutStore';
import { SYMBOLS, INTERVALS } from '@/lib/markets';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resets the store to clean defaults between tests. */
function resetStore() {
  useLayoutStore.setState({
    layout: '1',
    activePane: 0,
    panes: [
      {
        symbol: SYMBOLS[0].symbol,
        interval: INTERVALS[0],
        timeRangePreset: null,
        indicators: [],
        chartType: 'candles',
        category: 'spot',
      },
      {
        symbol: SYMBOLS[1].symbol,
        interval: INTERVALS[0],
        timeRangePreset: null,
        indicators: [],
        chartType: 'candles',
        category: 'spot',
      },
      {
        symbol: SYMBOLS[2].symbol,
        interval: INTERVALS[0],
        timeRangePreset: null,
        indicators: [],
        chartType: 'candles',
        category: 'spot',
      },
      {
        symbol: SYMBOLS[3].symbol,
        interval: INTERVALS[0],
        timeRangePreset: null,
        indicators: [],
        chartType: 'candles',
        category: 'spot',
      },
    ],
    syncOptions: {
      symbol: false,
      interval: false,
      crosshair: true,
      timeRange: true,
    },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('layoutStore', () => {
  beforeEach(resetStore);

  // ── setLayout() ───────────────────────────────────────────────────────────

  describe('setLayout()', () => {
    it('updates the active layout', () => {
      useLayoutStore.getState().setLayout('4');
      expect(useLayoutStore.getState().layout).toBe('4');
    });

    it('keeps activePane unchanged when still in range for the new layout', () => {
      useLayoutStore.setState({ activePane: 1 });
      useLayoutStore.getState().setLayout('4'); // 4 panes → indices 0-3
      expect(useLayoutStore.getState().activePane).toBe(1);
    });

    it('clamps activePane to count-1 (not 0) when out of range', () => {
      useLayoutStore.setState({ activePane: 3 });
      useLayoutStore.getState().setLayout('2h'); // 2 panes → max index 1
      expect(useLayoutStore.getState().activePane).toBe(1);
    });

    it('clamps activePane to 0 when switching to single-pane layout', () => {
      useLayoutStore.setState({ activePane: 3 });
      useLayoutStore.getState().setLayout('1'); // 1 pane → only index 0
      expect(useLayoutStore.getState().activePane).toBe(0);
    });

    it('clamps activePane to 2 when switching from 4 to 3h with pane 3 active', () => {
      useLayoutStore.setState({ activePane: 3 });
      useLayoutStore.getState().setLayout('3h'); // 3 panes → max index 2
      expect(useLayoutStore.getState().activePane).toBe(2);
    });
  });

  // ── setActivePane() ───────────────────────────────────────────────────────

  describe('setActivePane()', () => {
    it('sets the active pane index', () => {
      useLayoutStore.getState().setLayout('4');
      useLayoutStore.getState().setActivePane(2);
      expect(useLayoutStore.getState().activePane).toBe(2);
    });
  });

  // ── setPaneSymbol() ───────────────────────────────────────────────────────

  describe('setPaneSymbol()', () => {
    it('updates only the target pane when sync.symbol is off', () => {
      useLayoutStore.getState().setPaneSymbol(1, 'XRPUSDT');
      const { panes } = useLayoutStore.getState();
      expect(panes[0].symbol).toBe(SYMBOLS[0].symbol); // unchanged
      expect(panes[1].symbol).toBe('XRPUSDT'); // changed
      expect(panes[2].symbol).toBe(SYMBOLS[2].symbol); // unchanged
    });

    it('updates all panes when sync.symbol is on', () => {
      useLayoutStore.setState({
        syncOptions: { symbol: true, interval: false, crosshair: true, timeRange: true },
      });
      useLayoutStore.getState().setPaneSymbol(0, 'ADAUSDT');
      const { panes } = useLayoutStore.getState();
      expect(panes.every((p) => p.symbol === 'ADAUSDT')).toBe(true);
    });
  });

  // ── setPaneInterval() ─────────────────────────────────────────────────────

  describe('setPaneInterval()', () => {
    it('updates only the target pane when sync.interval is off', () => {
      useLayoutStore.getState().setPaneInterval(2, '4h');
      const { panes } = useLayoutStore.getState();
      expect(panes[0].interval).toBe(INTERVALS[0]); // unchanged
      expect(panes[2].interval).toBe('4h'); // changed
    });

    it('updates all panes when sync.interval is on', () => {
      useLayoutStore.setState({
        syncOptions: { symbol: false, interval: true, crosshair: true, timeRange: true },
      });
      useLayoutStore.getState().setPaneInterval(0, '1h');
      const { panes } = useLayoutStore.getState();
      expect(panes.every((p) => p.interval === '1h')).toBe(true);
    });
  });

  // ── toggleSync() ──────────────────────────────────────────────────────────

  describe('toggleSync()', () => {
    it('toggles crosshair sync off (default is on)', () => {
      useLayoutStore.getState().toggleSync('crosshair');
      expect(useLayoutStore.getState().syncOptions.crosshair).toBe(false);
    });

    it('toggles crosshair sync back on after two toggles', () => {
      useLayoutStore.getState().toggleSync('crosshair');
      useLayoutStore.getState().toggleSync('crosshair');
      expect(useLayoutStore.getState().syncOptions.crosshair).toBe(true);
    });

    it('toggles symbol sync on (default is off)', () => {
      useLayoutStore.getState().toggleSync('symbol');
      expect(useLayoutStore.getState().syncOptions.symbol).toBe(true);
    });

    it('toggles timeRange sync off (default is on)', () => {
      useLayoutStore.getState().toggleSync('timeRange');
      expect(useLayoutStore.getState().syncOptions.timeRange).toBe(false);
    });

    // ── snap-on-enable: symbol ───────────────────────────────────────────────

    it('snaps all panes to active pane symbol when symbol sync is enabled', () => {
      // pane 0 = BTC, pane 1 = ETH, pane 2 = SOL; active = 1 (ETH)
      useLayoutStore.setState({ activePane: 1 });
      useLayoutStore.getState().toggleSync('symbol');
      const { panes, syncOptions } = useLayoutStore.getState();
      expect(syncOptions.symbol).toBe(true);
      expect(panes.every((p) => p.symbol === SYMBOLS[1].symbol)).toBe(true);
    });

    it('does NOT snap panes when symbol sync is disabled', () => {
      // Turn on then off — panes should already be uniform from enable, but
      // disabling should only flip the flag, not change symbols.
      useLayoutStore.setState({ activePane: 0 });
      useLayoutStore.getState().toggleSync('symbol'); // enable → snap to BTC
      useLayoutStore.getState().toggleSync('symbol'); // disable
      const { panes, syncOptions } = useLayoutStore.getState();
      expect(syncOptions.symbol).toBe(false);
      // Panes still carry the snapped symbol — disabling doesn't diverge them
      expect(panes.every((p) => p.symbol === SYMBOLS[0].symbol)).toBe(true);
    });

    // ── snap-on-enable: interval ─────────────────────────────────────────────

    it('snaps all panes to active pane interval when interval sync is enabled', () => {
      // Give pane 2 a different interval, make it active
      useLayoutStore.setState({
        activePane: 2,
        panes: [
          {
            symbol: SYMBOLS[0].symbol,
            interval: '1m',
            timeRangePreset: null,
            indicators: [],
            chartType: 'candles',
            category: 'spot',
          },
          {
            symbol: SYMBOLS[1].symbol,
            interval: '5m',
            timeRangePreset: null,
            indicators: [],
            chartType: 'candles',
            category: 'spot',
          },
          {
            symbol: SYMBOLS[2].symbol,
            interval: '1h',
            timeRangePreset: null,
            indicators: [],
            chartType: 'candles',
            category: 'spot',
          },
          {
            symbol: SYMBOLS[3].symbol,
            interval: '4h',
            timeRangePreset: null,
            indicators: [],
            chartType: 'candles',
            category: 'spot',
          },
        ],
      });
      useLayoutStore.getState().toggleSync('interval');
      const { panes, syncOptions } = useLayoutStore.getState();
      expect(syncOptions.interval).toBe(true);
      expect(panes.every((p) => p.interval === '1h')).toBe(true);
    });
  });

  // ── setPaneChartType() + persistence ──────────────────────────────────────

  describe('setPaneChartType()', () => {
    it('updates only the target pane', () => {
      useLayoutStore.getState().setPaneChartType(1, 'heikinAshi');
      const { panes } = useLayoutStore.getState();
      expect(panes[1].chartType).toBe('heikinAshi');
      expect(panes[0].chartType).toBe('candles');
    });
  });

  describe('persisted chartType', () => {
    const { migrate, merge } = useLayoutStore.persist.getOptions();

    it('v2 → v3 migration defaults every pane to candles', () => {
      const v2 = { panes: [{ symbol: 'BTCUSDT', interval: '1m', indicators: [] }] };
      const migrated = migrate!(v2, 2) as { panes: PaneConfig[] };
      expect(migrated.panes[0].chartType).toBe('candles');
    });

    it('merge replaces an unknown chartType with candles', () => {
      const current = useLayoutStore.getState();
      const persisted = {
        panes: current.panes.map((p, i) =>
          i === 0 ? { ...p, chartType: 'renko' as unknown as PaneConfig['chartType'] } : p
        ),
      };
      const merged = merge!(persisted, current);
      expect(merged.panes[0].chartType).toBe('candles');
    });

    it('merge keeps a valid persisted chartType', () => {
      const current = useLayoutStore.getState();
      const persisted = {
        panes: current.panes.map((p, i) =>
          i === 2 ? { ...p, chartType: 'heikinAshi' as const } : p
        ),
      };
      expect(merge!(persisted, current).panes[2].chartType).toBe('heikinAshi');
    });
  });

  // ── category (APP_LOG Bybit Parity BP-0) ─────────────────────────────────────

  describe('setPaneCategory()', () => {
    it('updates only the target pane when sync.symbol is off', () => {
      useLayoutStore.getState().setPaneCategory(1, 'linear');
      const { panes } = useLayoutStore.getState();
      expect(panes[1].category).toBe('linear');
      expect(panes[0].category).toBe('spot');
    });

    it('updates all panes when sync.symbol is on', () => {
      useLayoutStore.setState({
        syncOptions: { ...useLayoutStore.getState().syncOptions, symbol: true },
      });
      useLayoutStore.getState().setPaneCategory(2, 'linear');
      expect(useLayoutStore.getState().panes.every((p) => p.category === 'linear')).toBe(true);
    });

    it('synced setPaneSymbol copies the source pane category to every pane', () => {
      useLayoutStore.getState().setPaneCategory(1, 'linear');
      useLayoutStore.setState({
        syncOptions: { ...useLayoutStore.getState().syncOptions, symbol: true },
      });
      useLayoutStore.getState().setPaneSymbol(1, 'ETHUSDT');
      const { panes } = useLayoutStore.getState();
      expect(panes.every((p) => p.symbol === 'ETHUSDT' && p.category === 'linear')).toBe(true);
    });

    it('enabling symbol sync snaps every pane to the active pane category', () => {
      useLayoutStore.getState().setPaneCategory(0, 'linear');
      useLayoutStore.getState().toggleSync('symbol');
      expect(useLayoutStore.getState().panes.every((p) => p.category === 'linear')).toBe(true);
    });
  });

  describe('persisted category', () => {
    const { migrate, merge } = useLayoutStore.persist.getOptions();

    it('new layouts default every pane to spot', () => {
      const initial = useLayoutStore.getInitialState();
      expect(initial.panes.every((p) => p.category === 'spot')).toBe(true);
    });

    it('v3 → v4 migration keeps existing layouts on spot (D7 move deferred to BP-2)', () => {
      const v3 = {
        panes: [{ symbol: 'BTCUSDT', interval: '1m', indicators: [], chartType: 'heikinAshi' }],
      };
      const migrated = migrate!(v3, 3) as { panes: PaneConfig[] };
      expect(migrated.panes[0].category).toBe('spot');
      expect(migrated.panes[0].chartType).toBe('heikinAshi');
    });

    it('merge replaces an unknown category with spot (🔐 it reaches a server request)', () => {
      const current = useLayoutStore.getState();
      const persisted = {
        panes: current.panes.map((p, i) =>
          i === 0 ? { ...p, category: 'inverse' as unknown as PaneConfig['category'] } : p
        ),
      };
      expect(merge!(persisted, current).panes[0].category).toBe('spot');
    });

    it('merge keeps a valid persisted category', () => {
      const current = useLayoutStore.getState();
      const persisted = {
        panes: current.panes.map((p, i) => (i === 3 ? { ...p, category: 'linear' as const } : p)),
      };
      expect(merge!(persisted, current).panes[3].category).toBe('linear');
    });

    it('merge rebuilds a short panes array with a valid category per pane', () => {
      const current = useLayoutStore.getState();
      const persisted = {
        panes: [
          { symbol: 'ETHUSDT', interval: '1m', category: 'linear' },
        ] as unknown as PaneConfig[],
      };
      const merged = merge!(persisted, current);
      expect(merged.panes).toHaveLength(4);
      expect(merged.panes[0].category).toBe('linear');
      expect(merged.panes[1].category).toBe('spot');
    });
  });

  // ── BP-2: setPaneMarket + D7 hand-off flag ───────────────────────────────
  describe('setPaneMarket()', () => {
    it('sets market and symbol of one pane in a single update', () => {
      let updates = 0;
      const unsubscribe = useLayoutStore.subscribe(() => updates++);
      useLayoutStore.getState().setPaneMarket(1, 'linear', 'SOLUSDT');
      unsubscribe();
      expect(updates).toBe(1); // one update → the pane feed reconnects once
      expect(useLayoutStore.getState().panes[1]).toMatchObject({
        category: 'linear',
        symbol: 'SOLUSDT',
      });
      expect(useLayoutStore.getState().panes[0].category).toBe('spot');
    });

    it('is a no-op when the pane already shows that market', () => {
      let updates = 0;
      const unsubscribe = useLayoutStore.subscribe(() => updates++);
      const { symbol, category } = useLayoutStore.getState().panes[0];
      useLayoutStore.getState().setPaneMarket(0, category, symbol);
      unsubscribe();
      expect(updates).toBe(0);
    });

    it('follows symbol sync: every pane switches market and symbol', () => {
      useLayoutStore.getState().toggleSync('symbol');
      useLayoutStore.getState().setPaneMarket(0, 'linear', 'ETHUSDT');
      for (const p of useLayoutStore.getState().panes) {
        expect(p).toMatchObject({ category: 'linear', symbol: 'ETHUSDT' });
      }
    });
  });

  // ── Persistence across a reload (cd-layout) ──────────────────────────────────

  describe('persistence (cd-layout)', () => {
    /** What persist wrote to localStorage, as a reload would read it. */
    function saved(): string {
      const raw = localStorage.getItem('cd-layout');
      if (raw === null) throw new Error('cd-layout was never written');
      return raw;
    }

    /** A reload: the store starts from defaults and reads `raw` back from localStorage. */
    async function reloadFrom(raw: string) {
      resetStore();
      localStorage.setItem('cd-layout', raw);
      await useLayoutStore.persist.rehydrate();
    }

    it('should restore the 2h layout when the page reloads (10.1.7)', async () => {
      useLayoutStore.getState().setLayout('2h');
      const raw = saved();
      expect(JSON.parse(raw).state.layout).toBe('2h');

      await reloadFrom(raw);

      expect(useLayoutStore.getState().layout).toBe('2h');
    });

    it('should restore every sync toggle as it was left when the page reloads (10.4.8)', async () => {
      // Defaults: symbol off, interval off, crosshair on, time range on
      useLayoutStore.getState().toggleSync('symbol');
      useLayoutStore.getState().toggleSync('crosshair');
      const expected = { symbol: true, interval: false, crosshair: false, timeRange: true };
      expect(useLayoutStore.getState().syncOptions).toEqual(expected);
      const raw = saved();

      await reloadFrom(raw);

      expect(useLayoutStore.getState().syncOptions).toEqual(expected);
    });
  });

  describe('marketHandoffDone (D7, v5)', () => {
    const { migrate, merge } = useLayoutStore.persist.getOptions();

    it('a layout saved before BP-2 still owes the hand-off', () => {
      const v4 = { panes: [{ symbol: 'BTCUSDT', category: 'spot' }] };
      expect((migrate!(v4, 4) as { marketHandoffDone: boolean }).marketHandoffDone).toBe(false);
    });

    it('a fresh layout never runs it (new users start on Spot)', () => {
      expect(useLayoutStore.getInitialState().marketHandoffDone).toBe(true);
    });

    it('merge keeps a boolean and repairs anything else', () => {
      const current = useLayoutStore.getState();
      expect(merge!({ marketHandoffDone: false }, current).marketHandoffDone).toBe(false);
      expect(
        merge!({ marketHandoffDone: 'yes' as unknown as boolean }, current).marketHandoffDone
      ).toBe(true);
    });

    it('completeMarketHandoff marks it done', () => {
      useLayoutStore.setState({ marketHandoffDone: false });
      useLayoutStore.getState().completeMarketHandoff();
      expect(useLayoutStore.getState().marketHandoffDone).toBe(true);
    });
  });
});
