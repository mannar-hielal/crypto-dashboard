/**
 * checkPendingTrigger + effectiveCheckPrice unit tests
 *
 * Both functions are extracted as pure functions so they can be
 * tested in isolation — no React, no store, no side effects.
 *
 * checkPendingTrigger coverage:
 *   - Limit Buy:  triggers when price <= triggerPrice
 *   - Limit Sell: triggers when price >= triggerPrice
 *   - Stop  Buy:  triggers when price >= triggerPrice
 *   - Stop  Sell: triggers when price <= triggerPrice
 *   - Boundary conditions (price exactly at triggerPrice)
 *   - No-trigger cases for all four combinations
 *
 * effectiveCheckPrice coverage:
 *   - Limit Buy  → uses min(latestPrice, candleLow)  — price fell into trigger
 *   - Stop  Buy  → uses max(latestPrice, candleHigh) — price rose into trigger
 *   - Limit Sell → uses max(latestPrice, candleHigh) — price rose into trigger
 *   - Stop  Sell → uses min(latestPrice, candleLow)  — price fell into trigger
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkPendingTrigger, effectiveCheckPrice } from '../usePendingOrderMonitor';

// ─── Limit Buy ────────────────────────────────────────────────────────────────

describe('checkPendingTrigger() — Limit Buy', () => {
  const base = { side: 'buy' as const, type: 'limit' as const, triggerPrice: 50_000 };

  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, 50_000)).toBe(true);
  });

  it('triggers when price drops below triggerPrice', () => {
    expect(checkPendingTrigger(base, 49_000)).toBe(true);
  });

  it('does NOT trigger when price is above triggerPrice', () => {
    expect(checkPendingTrigger(base, 51_000)).toBe(false);
  });
});

// ─── Limit Sell ───────────────────────────────────────────────────────────────

describe('checkPendingTrigger() — Limit Sell', () => {
  const base = { side: 'sell' as const, type: 'limit' as const, triggerPrice: 60_000 };

  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, 60_000)).toBe(true);
  });

  it('triggers when price rises above triggerPrice', () => {
    expect(checkPendingTrigger(base, 61_000)).toBe(true);
  });

  it('does NOT trigger when price is below triggerPrice', () => {
    expect(checkPendingTrigger(base, 59_000)).toBe(false);
  });
});

// ─── Stop Buy ─────────────────────────────────────────────────────────────────

describe('checkPendingTrigger() — Stop Buy', () => {
  const base = { side: 'buy' as const, type: 'stop' as const, triggerPrice: 55_000 };

  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, 55_000)).toBe(true);
  });

  it('triggers when price rises above triggerPrice (breakout)', () => {
    expect(checkPendingTrigger(base, 56_000)).toBe(true);
  });

  it('does NOT trigger when price is below triggerPrice', () => {
    expect(checkPendingTrigger(base, 54_000)).toBe(false);
  });
});

// ─── Stop Sell ────────────────────────────────────────────────────────────────

describe('checkPendingTrigger() — Stop Sell', () => {
  const base = { side: 'sell' as const, type: 'stop' as const, triggerPrice: 45_000 };

  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, 45_000)).toBe(true);
  });

  it('triggers when price drops below triggerPrice (breakdown)', () => {
    expect(checkPendingTrigger(base, 44_000)).toBe(true);
  });

  it('does NOT trigger when price is above triggerPrice', () => {
    expect(checkPendingTrigger(base, 46_000)).toBe(false);
  });
});

// ─── Boundary — price exactly one tick away ───────────────────────────────────

describe('checkPendingTrigger() — one tick away (should NOT trigger)', () => {
  it('Limit Buy: price 1 above trigger — no fill', () => {
    expect(checkPendingTrigger({ side: 'buy', type: 'limit', triggerPrice: 50_000 }, 50_001)).toBe(
      false
    );
  });

  it('Limit Sell: price 1 below trigger — no fill', () => {
    expect(checkPendingTrigger({ side: 'sell', type: 'limit', triggerPrice: 60_000 }, 59_999)).toBe(
      false
    );
  });

  it('Stop Buy: price 1 below trigger — no fill', () => {
    expect(checkPendingTrigger({ side: 'buy', type: 'stop', triggerPrice: 55_000 }, 54_999)).toBe(
      false
    );
  });

  it('Stop Sell: price 1 above trigger — no fill', () => {
    expect(checkPendingTrigger({ side: 'sell', type: 'stop', triggerPrice: 45_000 }, 45_001)).toBe(
      false
    );
  });
});

// ─── effectiveCheckPrice ──────────────────────────────────────────────────────

describe('effectiveCheckPrice()', () => {
  // Limit Buy + Stop Sell → "buy direction" → use candleLow
  it('Limit Buy: returns min(latestPrice, candleLow)', () => {
    expect(effectiveCheckPrice({ side: 'buy', type: 'limit' }, 50_100, 49_500, 50_200)).toBe(
      49_500
    ); // candleLow < latestPrice
  });

  it('Limit Buy: returns latestPrice when it is already below candleLow', () => {
    expect(effectiveCheckPrice({ side: 'buy', type: 'limit' }, 49_000, 49_500, 50_200)).toBe(
      49_000
    );
  });

  it('Stop Sell: returns min(latestPrice, candleLow)', () => {
    expect(effectiveCheckPrice({ side: 'sell', type: 'stop' }, 50_100, 49_500, 50_200)).toBe(
      49_500
    );
  });

  // Limit Sell + Stop Buy → "sell direction" → use candleHigh
  it('Limit Sell: returns max(latestPrice, candleHigh)', () => {
    expect(effectiveCheckPrice({ side: 'sell', type: 'limit' }, 59_800, 59_500, 60_200)).toBe(
      60_200
    ); // candleHigh > latestPrice
  });

  it('Limit Sell: returns latestPrice when it is already above candleHigh', () => {
    expect(effectiveCheckPrice({ side: 'sell', type: 'limit' }, 60_500, 59_500, 60_200)).toBe(
      60_500
    );
  });

  it('Stop Buy: returns max(latestPrice, candleHigh)', () => {
    expect(effectiveCheckPrice({ side: 'buy', type: 'stop' }, 55_100, 54_800, 55_800)).toBe(55_800);
  });

  // Candle sweep: latestPrice above trigger but candleLow below — Limit Buy triggers
  it('Limit Buy candle sweep: latestPrice above trigger, candleLow below → effectiveCheckPrice triggers', () => {
    const order = { side: 'buy' as const, type: 'limit' as const, triggerPrice: 50_000 };
    const eff = effectiveCheckPrice(order, 50_100 /* above */, 49_900 /* below */, 50_200);
    expect(eff).toBe(49_900);
    expect(checkPendingTrigger(order, eff)).toBe(true);
  });
});

// ─── evaluatePanePendingOrders — multi-pane symbol isolation ──────────────────
// Regression tests for the fix that expanded the monitor from paneStores[0]-only
// to ALL four pane stores. Before the fix, a pending order on a non-pane-0
// symbol was never evaluated → it pended forever with its USDT locked.

import { evaluatePanePendingOrders } from '../usePendingOrderMonitor';
import { useLayoutStore } from '@/store/layoutStore';
import { usePaperStore } from '@/store/paperStore';

describe('evaluatePanePendingOrders() multi-pane symbol isolation', () => {
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

  it('fills a pending order whose symbol matches pane 1 (BTCUSDT) — not pane 0', () => {
    // Place a limit buy on BTCUSDT @ 78_000 (current price 78_500 → not filled yet)
    usePaperStore.getState().placeLimitOrder('BTCUSDT', 'buy', 78_000, 100);
    expect(usePaperStore.getState().pendingOrders).toHaveLength(1);

    // BTC price on pane 1 drops to 77_900 → below the 78_000 limit → fill
    evaluatePanePendingOrders(1, 77_900, []);

    expect(usePaperStore.getState().pendingOrders).toHaveLength(0);
    expect(usePaperStore.getState().positions).toHaveLength(1);
  });

  it('does NOT fill a BTCUSDT pending order from an ETHUSDT tick on pane 0', () => {
    usePaperStore.getState().placeLimitOrder('BTCUSDT', 'buy', 78_000, 100);

    // ETH price tick on pane 0 — pane 0 symbol is ETHUSDT, not BTCUSDT
    evaluatePanePendingOrders(0, 2_500, []);

    expect(usePaperStore.getState().pendingOrders).toHaveLength(1);
  });

  it('does NOT fill an ETHUSDT pending order from a BTCUSDT tick on pane 1', () => {
    usePaperStore.getState().placeLimitOrder('ETHUSDT', 'buy', 3_000, 100);

    // BTC price tick on pane 1 — pane 1 symbol is BTCUSDT, not ETHUSDT
    evaluatePanePendingOrders(1, 76_500, []);

    expect(usePaperStore.getState().pendingOrders).toHaveLength(1);
  });

  it('evaluates pending orders on every pane independently', () => {
    usePaperStore.getState().placeLimitOrder('ETHUSDT', 'buy', 3_000, 100);
    usePaperStore.getState().placeLimitOrder('BTCUSDT', 'buy', 78_000, 100);

    // ETH tick on pane 0 fills the ETH order; BTC on pane 1 is untouched
    evaluatePanePendingOrders(0, 2_900, []);

    expect(usePaperStore.getState().pendingOrders).toHaveLength(1);
    expect(usePaperStore.getState().positions).toHaveLength(1);
  });
});
