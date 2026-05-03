/**
 * checkTPSL + evaluatePanePositions regression tests
 *
 * The breach-check logic is extracted as a pure function so it can be
 * tested in isolation — no React, no store, no side effects.
 *
 * Coverage:
 *   - Long:  TP hit, SL hit, no trigger
 *   - Short: TP hit, SL hit, no trigger
 *   - Boundary conditions (price exactly at level)
 *   - Positions without TP/SL set
 *
 * Regression tests (4.18 incident):
 *   - Multi-pane symbol isolation: BTC price tick on pane 1 (BTCUSDT) closes
 *     a BTC position but does NOT close an ETH position.
 *   - Wrong-symbol SL: pane 0 = ETHUSDT, pane 1 = BTCUSDT, BTC position with
 *     SL typo (7800). ETH price tick on pane 0 must NOT close the BTC position.
 *     A BTC price tick at 7799 on pane 1 must close it (SL correctly in scope).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkTPSL, evaluatePanePositions } from '../useTPSLMonitor';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';

// ─── Long positions ───────────────────────────────────────────────────────────

describe('checkTPSL() — long positions', () => {
  it('returns "TP" when price reaches takeProfit (exact)', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 50_000 }, 50_000)).toBe('TP');
  });

  it('returns "TP" when price exceeds takeProfit', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 50_000 }, 51_000)).toBe('TP');
  });

  it('returns "SL" when price drops to stopLoss (exact)', () => {
    expect(checkTPSL({ side: 'long', stopLoss: 40_000 }, 40_000)).toBe('SL');
  });

  it('returns "SL" when price drops below stopLoss', () => {
    expect(checkTPSL({ side: 'long', stopLoss: 40_000 }, 39_000)).toBe('SL');
  });

  it('returns null when price is between SL and TP', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 50_000, stopLoss: 40_000 }, 45_000)).toBeNull();
  });

  it('returns "TP" — TP is checked before SL (TP wins if both breach simultaneously)', () => {
    // Pathological: TP <= SL (misconfigured). TP check runs first, so TP wins.
    expect(checkTPSL({ side: 'long', takeProfit: 40_000, stopLoss: 50_000 }, 55_000)).toBe('TP');
  });

  it('returns null when neither TP nor SL is configured', () => {
    expect(checkTPSL({ side: 'long' }, 99_999)).toBeNull();
  });

  it('returns null when only TP is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 60_000 }, 55_000)).toBeNull();
  });

  it('returns null when only SL is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'long', stopLoss: 30_000 }, 35_000)).toBeNull();
  });
});

// ─── Short positions ──────────────────────────────────────────────────────────

describe('checkTPSL() — short positions', () => {
  it('returns "TP" when price drops to takeProfit (exact)', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 40_000 }, 40_000)).toBe('TP');
  });

  it('returns "TP" when price drops below takeProfit', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 40_000 }, 39_000)).toBe('TP');
  });

  it('returns "SL" when price rises to stopLoss (exact)', () => {
    expect(checkTPSL({ side: 'short', stopLoss: 55_000 }, 55_000)).toBe('SL');
  });

  it('returns "SL" when price rises above stopLoss', () => {
    expect(checkTPSL({ side: 'short', stopLoss: 55_000 }, 56_000)).toBe('SL');
  });

  it('returns null when price is between TP and SL', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 40_000, stopLoss: 55_000 }, 48_000)).toBeNull();
  });

  it('returns null when neither TP nor SL is configured', () => {
    expect(checkTPSL({ side: 'short' }, 1)).toBeNull();
  });

  it('returns null when only TP is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 30_000 }, 35_000)).toBeNull();
  });

  it('returns null when only SL is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'short', stopLoss: 60_000 }, 55_000)).toBeNull();
  });
});

// ─── Multi-pane symbol isolation regression tests ────────────────────────────
//
// These tests call evaluatePanePositions() directly — the exported pure helper
// that the hook's store subscriptions invoke on every tick. This bypasses the
// React hook lifecycle so no renderHook/useEffect is needed.

describe('multi-pane symbol isolation (4.18 regression)', () => {
  beforeEach(() => {
    usePaperStore.getState().reset();

    // Pane 0 = ETHUSDT, Pane 1 = BTCUSDT
    useLayoutStore.setState({
      panes: [
        { symbol: 'ETHUSDT', interval: '1m' },
        { symbol: 'BTCUSDT', interval: '1m' },
        { symbol: 'SOLUSDT', interval: '1m' },
        { symbol: 'BNBUSDT', interval: '1m' },
      ],
    } as Parameters<typeof useLayoutStore.setState>[0]);

    paneStores[0].setState({ latestPrice: 3_000, bars: [], isConnected: true });
    paneStores[1].setState({ latestPrice: 78_000, bars: [], isConnected: true });
  });

  it('BTC price tick on pane 1 (BTCUSDT) closes a BTCUSDT SL position', () => {
    usePaperStore.getState().placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 77_000);
    expect(usePaperStore.getState().positions).toHaveLength(1);

    // Simulate BTC price drop to 76 500 on pane 1 (BTCUSDT pane)
    evaluatePanePositions(1, 76_500, []);

    expect(usePaperStore.getState().positions).toHaveLength(0);
  });

  it('ETH price tick on pane 0 does NOT close a BTCUSDT position', () => {
    usePaperStore.getState().placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 77_000);

    // Simulate an ETH price tick on pane 0 — should NOT affect BTC positions
    evaluatePanePositions(0, 2_500, []);

    expect(usePaperStore.getState().positions).toHaveLength(1);
  });

  it('BTC price tick on BTC pane does NOT close an ETHUSDT position', () => {
    usePaperStore.getState().placeOrder('ETHUSDT', 'buy', 3_000, 100, undefined, 2_800);

    // BTC price tick on pane 1 — pane 1 symbol is BTCUSDT, not ETHUSDT
    evaluatePanePositions(1, 76_500, []);

    expect(usePaperStore.getState().positions).toHaveLength(1);
  });

  it('both panes can independently trigger their own symbol positions', () => {
    usePaperStore.getState().placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 77_000);
    usePaperStore.getState().placeOrder('ETHUSDT', 'buy', 3_000, 100, undefined, 2_800);
    expect(usePaperStore.getState().positions).toHaveLength(2);

    // Trigger BTC SL via pane 1
    evaluatePanePositions(1, 76_500, []);
    expect(usePaperStore.getState().positions).toHaveLength(1);

    // Trigger ETH SL via pane 0
    evaluatePanePositions(0, 2_700, []);
    expect(usePaperStore.getState().positions).toHaveLength(0);
  });
});

// ─── Wrong-symbol SL typo regression (4.18 incident replay) ─────────────────

describe('wrong-symbol SL typo regression (4.18 incident)', () => {
  beforeEach(() => {
    usePaperStore.getState().reset();

    // Pane 0 = ETHUSDT, Pane 1 = BTCUSDT
    useLayoutStore.setState({
      panes: [
        { symbol: 'ETHUSDT', interval: '1m' },
        { symbol: 'BTCUSDT', interval: '1m' },
        { symbol: 'SOLUSDT', interval: '1m' },
        { symbol: 'BNBUSDT', interval: '1m' },
      ],
    } as Parameters<typeof useLayoutStore.setState>[0]);
  });

  it('ETH price tick at ~7500 does NOT close BTC Long with SL=7800 (wrong-symbol isolation)', () => {
    // BTC Long with SL typo: 7800 instead of 78000
    usePaperStore.getState().placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 7_800);

    // ETH price tick on pane 0 — pane 0 is ETHUSDT, so only ETHUSDT positions evaluate
    // 7500 < 7800, which would trigger the SL IF the wrong symbol were checked.
    evaluatePanePositions(0, 7_500, []);

    expect(usePaperStore.getState().positions).toHaveLength(1);
  });

  it('BTC price tick at 77000 does NOT close BTC Long with SL=7800 (SL not breached at real price)', () => {
    usePaperStore.getState().placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 7_800);

    // Normal BTC dip to 77000 — still above the typo SL of 7800
    evaluatePanePositions(1, 77_000, []);

    expect(usePaperStore.getState().positions).toHaveLength(1);
  });

  it('BTC price tick at 7799 closes BTC Long with SL=7800 (SL legitimately breached)', () => {
    usePaperStore.getState().placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 7_800);

    // BTC crashes all the way to 7799 — SL of 7800 is correctly triggered
    evaluatePanePositions(1, 7_799, []);

    expect(usePaperStore.getState().positions).toHaveLength(0);
  });
});

// ─── Long positions ───────────────────────────────────────────────────────────

describe('checkTPSL() — long positions', () => {
  it('returns "TP" when price reaches takeProfit (exact)', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 50_000 }, 50_000)).toBe('TP');
  });

  it('returns "TP" when price exceeds takeProfit', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 50_000 }, 51_000)).toBe('TP');
  });

  it('returns "SL" when price drops to stopLoss (exact)', () => {
    expect(checkTPSL({ side: 'long', stopLoss: 40_000 }, 40_000)).toBe('SL');
  });

  it('returns "SL" when price drops below stopLoss', () => {
    expect(checkTPSL({ side: 'long', stopLoss: 40_000 }, 39_000)).toBe('SL');
  });

  it('returns null when price is between SL and TP', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 50_000, stopLoss: 40_000 }, 45_000)).toBeNull();
  });

  it('returns "TP" — TP is checked before SL (TP wins if both breach simultaneously)', () => {
    // Pathological: TP <= SL (misconfigured). TP check runs first, so TP wins.
    expect(checkTPSL({ side: 'long', takeProfit: 40_000, stopLoss: 50_000 }, 55_000)).toBe('TP');
  });

  it('returns null when neither TP nor SL is configured', () => {
    expect(checkTPSL({ side: 'long' }, 99_999)).toBeNull();
  });

  it('returns null when only TP is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 60_000 }, 55_000)).toBeNull();
  });

  it('returns null when only SL is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'long', stopLoss: 30_000 }, 35_000)).toBeNull();
  });
});

// ─── Short positions ──────────────────────────────────────────────────────────

describe('checkTPSL() — short positions', () => {
  it('returns "TP" when price drops to takeProfit (exact)', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 40_000 }, 40_000)).toBe('TP');
  });

  it('returns "TP" when price drops below takeProfit', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 40_000 }, 39_000)).toBe('TP');
  });

  it('returns "SL" when price rises to stopLoss (exact)', () => {
    expect(checkTPSL({ side: 'short', stopLoss: 55_000 }, 55_000)).toBe('SL');
  });

  it('returns "SL" when price rises above stopLoss', () => {
    expect(checkTPSL({ side: 'short', stopLoss: 55_000 }, 56_000)).toBe('SL');
  });

  it('returns null when price is between TP and SL', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 40_000, stopLoss: 55_000 }, 48_000)).toBeNull();
  });

  it('returns null when neither TP nor SL is configured', () => {
    expect(checkTPSL({ side: 'short' }, 1)).toBeNull();
  });

  it('returns null when only TP is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 30_000 }, 35_000)).toBeNull();
  });

  it('returns null when only SL is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'short', stopLoss: 60_000 }, 55_000)).toBeNull();
  });
});
