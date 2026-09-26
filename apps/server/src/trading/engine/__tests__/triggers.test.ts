/**
 * Trigger tests — ported from apps/client/src/hooks/__tests__/useTPSLMonitor.test.ts and
 * usePendingOrderMonitor.test.ts (BP-1).
 *
 * - checkTPSL / checkPendingTrigger: unchanged cases. The TP/SL file listed its checkTPSL blocks
 *   twice; they are ported once.
 * - "Multi-pane symbol isolation" becomes symbol isolation in evaluateTick: the server evaluates
 *   every symbol, and a tick of one symbol only ever triggers that symbol's items.
 * - effectiveCheckPrice (the forming-candle sweep) is no longer used live (S3); its rules survive
 *   in backfill (evaluateCandle), tested below together with the S3 placement guard.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  checkPendingTrigger,
  checkTPSL,
  evaluateCandle,
  evaluateTick,
  executeTrigger,
  type Trigger,
} from '../index.js';
import { PaperHarness } from './harness.js';

const D = (n: number) => new Decimal(n);

function tpsl(side: 'long' | 'short', tp?: number, sl?: number) {
  return {
    side,
    ...(tp !== undefined ? { takeProfit: D(tp) } : {}),
    ...(sl !== undefined ? { stopLoss: D(sl) } : {}),
  };
}

function pending(side: 'buy' | 'sell', type: 'limit' | 'stop', triggerPrice: number) {
  return { side, type, triggerPrice: D(triggerPrice) };
}

/** What the matching engine does on a tick: evaluate, then execute each trigger in order. */
function tick(h: PaperHarness, symbol: string, price: number): Trigger[] {
  const triggers = evaluateTick(symbol, D(price), h.raw.positions, h.raw.pendingOrders);
  let n = 0;
  for (const t of triggers) {
    h.apply(executeTrigger(h.raw, t, { now: 1_800_000_000_000 + ++n, newId: () => `t-${n}` }));
  }
  return triggers;
}

// ─── checkTPSL ─────────────────────────────────────────────────────────────────

describe('checkTPSL() — long positions', () => {
  it('returns "TP" when price reaches takeProfit (exact)', () => {
    expect(checkTPSL(tpsl('long', 50_000), D(50_000))).toBe('TP');
  });
  it('returns "TP" when price exceeds takeProfit', () => {
    expect(checkTPSL(tpsl('long', 50_000), D(51_000))).toBe('TP');
  });
  it('returns "SL" when price drops to stopLoss (exact)', () => {
    expect(checkTPSL(tpsl('long', undefined, 40_000), D(40_000))).toBe('SL');
  });
  it('returns "SL" when price drops below stopLoss', () => {
    expect(checkTPSL(tpsl('long', undefined, 40_000), D(39_000))).toBe('SL');
  });
  it('returns null when price is between SL and TP', () => {
    expect(checkTPSL(tpsl('long', 50_000, 40_000), D(45_000))).toBeNull();
  });
  it('returns "TP" — TP is checked before SL (TP wins if both breach simultaneously)', () => {
    expect(checkTPSL(tpsl('long', 40_000, 50_000), D(55_000))).toBe('TP');
  });
  it('returns null when neither TP nor SL is configured', () => {
    expect(checkTPSL(tpsl('long'), D(99_999))).toBeNull();
  });
  it('returns null when only TP is set and price has not reached it', () => {
    expect(checkTPSL(tpsl('long', 60_000), D(55_000))).toBeNull();
  });
  it('returns null when only SL is set and price has not reached it', () => {
    expect(checkTPSL(tpsl('long', undefined, 30_000), D(35_000))).toBeNull();
  });
});

describe('checkTPSL() — short positions', () => {
  it('returns "TP" when price drops to takeProfit (exact)', () => {
    expect(checkTPSL(tpsl('short', 40_000), D(40_000))).toBe('TP');
  });
  it('returns "TP" when price drops below takeProfit', () => {
    expect(checkTPSL(tpsl('short', 40_000), D(39_000))).toBe('TP');
  });
  it('returns "SL" when price rises to stopLoss (exact)', () => {
    expect(checkTPSL(tpsl('short', undefined, 55_000), D(55_000))).toBe('SL');
  });
  it('returns "SL" when price rises above stopLoss', () => {
    expect(checkTPSL(tpsl('short', undefined, 55_000), D(56_000))).toBe('SL');
  });
  it('returns null when price is between TP and SL', () => {
    expect(checkTPSL(tpsl('short', 40_000, 55_000), D(48_000))).toBeNull();
  });
  it('returns null when neither TP nor SL is configured', () => {
    expect(checkTPSL(tpsl('short'), D(1))).toBeNull();
  });
  it('returns null when only TP is set and price has not reached it', () => {
    expect(checkTPSL(tpsl('short', 30_000), D(35_000))).toBeNull();
  });
  it('returns null when only SL is set and price has not reached it', () => {
    expect(checkTPSL(tpsl('short', undefined, 60_000), D(55_000))).toBeNull();
  });
});

// ─── checkPendingTrigger ───────────────────────────────────────────────────────

describe('checkPendingTrigger() — Limit Buy', () => {
  const base = pending('buy', 'limit', 50_000);
  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, D(50_000))).toBe(true);
  });
  it('triggers when price drops below triggerPrice', () => {
    expect(checkPendingTrigger(base, D(49_000))).toBe(true);
  });
  it('does NOT trigger when price is above triggerPrice', () => {
    expect(checkPendingTrigger(base, D(51_000))).toBe(false);
  });
});

describe('checkPendingTrigger() — Limit Sell', () => {
  const base = pending('sell', 'limit', 60_000);
  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, D(60_000))).toBe(true);
  });
  it('triggers when price rises above triggerPrice', () => {
    expect(checkPendingTrigger(base, D(61_000))).toBe(true);
  });
  it('does NOT trigger when price is below triggerPrice', () => {
    expect(checkPendingTrigger(base, D(59_000))).toBe(false);
  });
});

describe('checkPendingTrigger() — Stop Buy', () => {
  const base = pending('buy', 'stop', 55_000);
  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, D(55_000))).toBe(true);
  });
  it('triggers when price rises above triggerPrice (breakout)', () => {
    expect(checkPendingTrigger(base, D(56_000))).toBe(true);
  });
  it('does NOT trigger when price is below triggerPrice', () => {
    expect(checkPendingTrigger(base, D(54_000))).toBe(false);
  });
});

describe('checkPendingTrigger() — Stop Sell', () => {
  const base = pending('sell', 'stop', 45_000);
  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, D(45_000))).toBe(true);
  });
  it('triggers when price drops below triggerPrice (breakdown)', () => {
    expect(checkPendingTrigger(base, D(44_000))).toBe(true);
  });
  it('does NOT trigger when price is above triggerPrice', () => {
    expect(checkPendingTrigger(base, D(46_000))).toBe(false);
  });
});

describe('checkPendingTrigger() — one tick away (should NOT trigger)', () => {
  it('Limit Buy: price 1 above trigger — no fill', () => {
    expect(checkPendingTrigger(pending('buy', 'limit', 50_000), D(50_001))).toBe(false);
  });
  it('Limit Sell: price 1 below trigger — no fill', () => {
    expect(checkPendingTrigger(pending('sell', 'limit', 60_000), D(59_999))).toBe(false);
  });
  it('Stop Buy: price 1 below trigger — no fill', () => {
    expect(checkPendingTrigger(pending('buy', 'stop', 55_000), D(54_999))).toBe(false);
  });
  it('Stop Sell: price 1 above trigger — no fill', () => {
    expect(checkPendingTrigger(pending('sell', 'stop', 45_000), D(45_001))).toBe(false);
  });
});

// ─── Live ticks: symbol isolation (was multi-pane isolation, 4.18 regression) ──

describe('evaluateTick() symbol isolation (4.18 regression)', () => {
  let h: PaperHarness;
  beforeEach(() => {
    h = new PaperHarness();
  });

  it('a BTC tick closes a BTCUSDT SL position', () => {
    h.placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 77_000);
    tick(h, 'BTCUSDT', 76_500);
    expect(h.positions).toHaveLength(0);
    expect(h.journal[0].text).toBe('Auto-closed LONG BTCUSDT — Stop-Loss hit at $76500.00');
  });

  it('an ETH tick does NOT close a BTCUSDT position', () => {
    h.placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 77_000);
    tick(h, 'ETHUSDT', 2_500);
    expect(h.positions).toHaveLength(1);
  });

  it('a BTC tick does NOT close an ETHUSDT position', () => {
    h.placeOrder('ETHUSDT', 'buy', 3_000, 100, undefined, 2_800);
    tick(h, 'BTCUSDT', 76_500);
    expect(h.positions).toHaveLength(1);
  });

  it('each symbol independently triggers its own positions', () => {
    h.placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 77_000);
    h.placeOrder('ETHUSDT', 'buy', 3_000, 100, undefined, 2_800);
    tick(h, 'BTCUSDT', 76_500);
    expect(h.positions).toHaveLength(1);
    tick(h, 'ETHUSDT', 2_700);
    expect(h.positions).toHaveLength(0);
  });

  it('wrong-symbol SL typo: an ETH tick at 7500 does NOT close a BTC Long with SL=7800', () => {
    h.placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 7_800);
    tick(h, 'ETHUSDT', 7_500);
    expect(h.positions).toHaveLength(1);
  });

  it('wrong-symbol SL typo: a BTC tick at 77000 does NOT close a BTC Long with SL=7800', () => {
    h.placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 7_800);
    tick(h, 'BTCUSDT', 77_000);
    expect(h.positions).toHaveLength(1);
  });

  it('wrong-symbol SL typo: a BTC tick at 7799 closes a BTC Long with SL=7800', () => {
    h.placeOrder('BTCUSDT', 'buy', 78_000, 100, undefined, 7_800);
    tick(h, 'BTCUSDT', 7_799);
    expect(h.positions).toHaveLength(0);
  });

  it('fills a BTCUSDT pending order from a BTC tick, not an ETH one', () => {
    h.placeLimitOrder('BTCUSDT', 'buy', 78_000, 100);
    tick(h, 'ETHUSDT', 2_500);
    expect(h.pendingOrders).toHaveLength(1);
    tick(h, 'BTCUSDT', 77_900);
    expect(h.pendingOrders).toHaveLength(0);
    expect(h.positions).toHaveLength(1);
  });

  it('does NOT fill an ETHUSDT pending order from a BTC tick', () => {
    h.placeLimitOrder('ETHUSDT', 'buy', 3_000, 100);
    tick(h, 'BTCUSDT', 76_500);
    expect(h.pendingOrders).toHaveLength(1);
  });

  it('evaluates pending orders per symbol independently', () => {
    h.placeLimitOrder('ETHUSDT', 'buy', 3_000, 100);
    h.placeLimitOrder('BTCUSDT', 'buy', 78_000, 100);
    tick(h, 'ETHUSDT', 2_900);
    expect(h.pendingOrders).toHaveLength(1);
    expect(h.positions).toHaveLength(1);
  });

  it('TP wins when one tick crosses both levels (misconfigured TP below SL)', () => {
    h.placeOrder('BTCUSDT', 'buy', 50_000, 100, 40_000, 55_000);
    const [t] = tick(h, 'BTCUSDT', 56_000);
    expect(t).toMatchObject({ kind: 'exit', leg: 'take-profit' });
  });
});

// ─── S3: live fills use the tick price, never a candle extreme ─────────────────

describe('S3 — live triggers use the tick price', () => {
  it('a limit buy fills at the tick price that crossed it', () => {
    const h = new PaperHarness();
    h.placeLimitOrder('BTCUSDT', 'buy', 50_000, 1_000);
    tick(h, 'BTCUSDT', 49_990);
    expect(h.positions[0].entryPrice).toBe(49_990);
  });

  it('a TP close uses the tick price in the journal and the trade', () => {
    const h = new PaperHarness();
    h.placeOrder('BTCUSDT', 'buy', 50_000, 1_000, 55_000);
    tick(h, 'BTCUSDT', 55_010);
    expect(h.history[0].exitPrice).toBe(55_010);
    expect(h.lastSound).toBe('profit');
  });

  it('no trigger while the tick stays on the untriggered side', () => {
    const h = new PaperHarness();
    h.placeLimitOrder('BTCUSDT', 'buy', 50_000, 1_000);
    expect(tick(h, 'BTCUSDT', 50_001)).toHaveLength(0);
  });
});

// ─── Backfill: evaluateCandle (the old effectiveCheckPrice sweep) ──────────────

describe('evaluateCandle() — backfill sweep', () => {
  const candle = (start: number, low: number, high: number) => ({
    start,
    low: D(low),
    high: D(high),
  });

  function pendingItem(
    side: 'buy' | 'sell',
    type: 'limit' | 'stop',
    trigger: number,
    placedAt = 0
  ) {
    return {
      id: 'p1',
      symbol: 'BTCUSDT',
      side,
      type,
      usdtAmount: D(100),
      triggerPrice: D(trigger),
      qty: D(0.002),
      leverage: 1,
      placedAt,
    };
  }

  function positionItem(side: 'long' | 'short', tp?: number, sl?: number, openedAt = 0) {
    return {
      id: 'pos1',
      symbol: 'BTCUSDT',
      side,
      quantity: D(0.01),
      entryPrice: D(50_000),
      entryUsdtAmount: D(500),
      openedAt,
      ...(tp !== undefined ? { takeProfit: D(tp) } : {}),
      ...(sl !== undefined ? { stopLoss: D(sl) } : {}),
    };
  }

  it('Limit Buy uses the candle low and fills at the trigger price', () => {
    const [t] = evaluateCandle(
      'BTCUSDT',
      candle(60_000, 49_900, 50_200),
      [],
      [pendingItem('buy', 'limit', 50_000)]
    );
    expect(t).toMatchObject({ kind: 'fill', orderId: 'p1' });
    expect(t.price.toNumber()).toBe(50_000);
  });

  it('Stop Sell uses the candle low', () => {
    expect(
      evaluateCandle(
        'BTCUSDT',
        candle(60_000, 44_900, 45_500),
        [],
        [pendingItem('sell', 'stop', 45_000)]
      )
    ).toHaveLength(1);
  });

  it('Limit Sell uses the candle high', () => {
    expect(
      evaluateCandle(
        'BTCUSDT',
        candle(60_000, 59_500, 60_200),
        [],
        [pendingItem('sell', 'limit', 60_000)]
      )
    ).toHaveLength(1);
  });

  it('Stop Buy uses the candle high', () => {
    expect(
      evaluateCandle(
        'BTCUSDT',
        candle(60_000, 54_800, 55_800),
        [],
        [pendingItem('buy', 'stop', 55_500)]
      )
    ).toHaveLength(1);
  });

  it('no fill when the candle range never reaches the trigger', () => {
    expect(
      evaluateCandle(
        'BTCUSDT',
        candle(60_000, 50_100, 50_300),
        [],
        [pendingItem('buy', 'limit', 50_000)]
      )
    ).toHaveLength(0);
  });

  it('S3: ignores a candle that started before the order was placed', () => {
    expect(
      evaluateCandle(
        'BTCUSDT',
        candle(60_000, 49_000, 51_000),
        [],
        [pendingItem('buy', 'limit', 50_000, 60_001)]
      )
    ).toHaveLength(0);
  });

  it('S3: ignores a candle that started before the position opened', () => {
    expect(
      evaluateCandle(
        'BTCUSDT',
        candle(60_000, 40_000, 60_000),
        [positionItem('long', 55_000, 45_000, 60_500)],
        []
      )
    ).toHaveLength(0);
  });

  it('closes at the crossed level; TP wins when the candle spans both', () => {
    const [t] = evaluateCandle(
      'BTCUSDT',
      candle(60_000, 44_000, 56_000),
      [positionItem('long', 55_000, 45_000)],
      []
    );
    expect(t).toMatchObject({ kind: 'exit', leg: 'take-profit' });
    expect(t.price.toNumber()).toBe(55_000);
  });

  it('short SL uses the candle high', () => {
    const [t] = evaluateCandle(
      'BTCUSDT',
      candle(60_000, 49_000, 52_500),
      [positionItem('short', 45_000, 52_000)],
      []
    );
    expect(t).toMatchObject({ kind: 'exit', leg: 'stop-loss' });
    expect(t.price.toNumber()).toBe(52_000);
  });
});
