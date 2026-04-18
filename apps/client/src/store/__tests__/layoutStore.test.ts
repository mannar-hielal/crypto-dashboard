/**
 * layoutStore tests
 *
 * Tests cover the non-trivial store behaviours that are most likely to regress:
 *   - setLayout(): activePane clamped to count-1 (not reset to 0) when out of range
 *   - setPaneSymbol(): single-pane update vs. sync.symbol broadcast
 *   - setPaneInterval(): single-pane update vs. sync.interval broadcast
 *   - toggleSync(): toggles individual sync flags + snap-on-enable for symbol/interval
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore } from '../layoutStore';
import { SYMBOLS, INTERVALS } from '@/lib/markets';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resets the store to clean defaults between tests. */
function resetStore() {
  useLayoutStore.setState({
    layout: '1',
    activePane: 0,
    panes: [
      { symbol: SYMBOLS[0].symbol, interval: INTERVALS[0] },
      { symbol: SYMBOLS[1].symbol, interval: INTERVALS[0] },
      { symbol: SYMBOLS[2].symbol, interval: INTERVALS[0] },
      { symbol: SYMBOLS[3].symbol, interval: INTERVALS[0] },
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
          { symbol: SYMBOLS[0].symbol, interval: '1m' },
          { symbol: SYMBOLS[1].symbol, interval: '5m' },
          { symbol: SYMBOLS[2].symbol, interval: '1h' },
          { symbol: SYMBOLS[3].symbol, interval: '4h' },
        ],
      });
      useLayoutStore.getState().toggleSync('interval');
      const { panes, syncOptions } = useLayoutStore.getState();
      expect(syncOptions.interval).toBe(true);
      expect(panes.every((p) => p.interval === '1h')).toBe(true);
    });
  });
});
