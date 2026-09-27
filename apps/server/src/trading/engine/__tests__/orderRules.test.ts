/**
 * BP-5 B: trigger source (Bybit `triggerBy` — last / mark / index), reduce-only and
 * close-on-trigger orders, and the TP / SL side check (owner decision O9).
 *
 * Reference: long 0.1 BTC @ 50,000 at 10× — IM 500.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  REJECT_EXIT_NO_PRICE,
  REJECT_REDUCE_ONLY_NO_POSITION,
  REJECT_REDUCE_ONLY_SIDE,
  REJECT_REDUCE_ONLY_TPSL,
  applyDelta,
  closePosition,
  editPending,
  evaluateCandle,
  evaluateTick,
  fillPending,
  placeMarket,
  placePending,
  setSymbolLeverage,
  updatePositionExits,
  type AccountState,
  type ActionResult,
  type EngineContext,
  type InstrumentRules,
  type Quote,
} from '../index.js';
import { fallbackRiskTiers } from '../../bybitSpec.js';

const D = (v: number | string) => new Decimal(v);
const RULES: InstrumentRules = {
  tickSize: D('0.1'),
  qtyStep: D('0.001'),
  minOrderQty: D('0.001'),
  minNotional: D(5),
};
const TIERS = fallbackRiskTiers('BTCUSDT');
const flat = (p: number, extra: Partial<Quote> = {}): Quote => ({
  last: D(p),
  bid: D(p),
  ask: D(p),
  ...extra,
});

let clock = 1_800_000_000_000;
let seq = 0;
const ctx = (): EngineContext => {
  clock += 1_000;
  return { now: clock, newId: () => `id${++seq}`, riskTiers: () => TIERS };
};

function account(overrides: Partial<AccountState> = {}): AccountState {
  return {
    balance: D(10_000),
    realizedPnl: D(0),
    leverage: 10,
    symbolLeverage: { BTCUSDT: 10 },
    symbolFundingAt: {},
    spot: [],
    positions: [],
    pendingOrders: [],
    ...overrides,
  };
}

/** Apply an action; fail the test on an unexpected refusal. */
function run<R>(state: AccountState, res: ActionResult<R>): [AccountState, R] {
  expect(res.invalid).toBeUndefined();
  return [applyDelta(state, res.delta), res.result];
}

/** Long 0.1 BTC @ 50,000 at 10× */
function withLong(
  extra: Parameters<typeof placeMarket>[1] extends infer I ? Partial<I> : never = {}
) {
  const [s] = run(
    account(),
    placeMarket(
      account(),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') }, ...extra },
      flat(50_000, { mark: D(50_000), index: D(50_000) }),
      RULES,
      ctx()
    )
  );
  return s;
}

// ─── Trigger source ────────────────────────────────────────────────────────────

describe('BP-5 B — TP / SL and stops trigger on the price they are set to', () => {
  it('a stop-loss on the mark price ignores the last price and fires on the mark', () => {
    const s = withLong({ stopLoss: D(48_000), slTriggerBy: 'MarkPrice' });
    expect(s.positions[0].slTriggerBy).toBe('MarkPrice');
    const mark = (p: number) => ({ price: D(p), tiers: TIERS });
    // Last below the SL, mark above it: nothing
    expect(evaluateTick('linear', 'BTCUSDT', D(47_000), s.positions, [], mark(48_500))).toEqual([]);
    // Mark reaches it
    const [t] = evaluateTick('linear', 'BTCUSDT', D(49_000), s.positions, [], mark(47_990));
    expect(t).toMatchObject({ kind: 'exit', leg: 'stop-loss', by: 'MarkPrice' });
    expect(t.price.toString()).toBe('47990');
  });

  it('an index-price leg is not checked on a tick with no index, and fires on one', () => {
    const s = withLong({ takeProfit: D(52_000), tpTriggerBy: 'IndexPrice' });
    expect(evaluateTick('linear', 'BTCUSDT', D(53_000), s.positions, [])).toEqual([]);
    const [t] = evaluateTick('linear', 'BTCUSDT', D(51_000), s.positions, [], undefined, D(52_000));
    expect(t).toMatchObject({ kind: 'exit', leg: 'take-profit', by: 'IndexPrice' });
  });

  it('a LastPrice trigger carries no `by` (unchanged from BP-4)', () => {
    const s = withLong({ takeProfit: D(52_000) });
    const [t] = evaluateTick('linear', 'BTCUSDT', D(52_000), s.positions, []);
    expect(t).toEqual({
      kind: 'exit',
      positionId: s.positions[0].id,
      leg: 'take-profit',
      price: D(52_000),
    });
  });

  it('a stop order triggers on its source; a limit always on the last price', () => {
    let s = account();
    [s] = run(
      s,
      placePending(
        s,
        {
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'stop',
          triggerPrice: D(51_000),
          size: { qty: D('0.1') },
          triggerBy: 'MarkPrice',
        },
        undefined,
        RULES,
        ctx()
      )
    );
    [s] = run(
      s,
      placePending(
        s,
        {
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'limit',
          triggerPrice: D(49_000),
          size: { qty: D('0.1') },
          // Ignored: a limit rests on the last price
          triggerBy: 'MarkPrice',
        },
        flat(50_000),
        RULES,
        ctx()
      )
    );
    const [stop, limit] = s.pendingOrders;
    expect(stop.triggerBy).toBe('MarkPrice');
    expect(limit.triggerBy).toBeUndefined();
    const mark = (p: number) => ({ price: D(p), tiers: TIERS });
    // Last 51,500 (past the stop), mark 50,900: the stop waits; last 48,900 fills the limit
    const hits = evaluateTick(
      'linear',
      'BTCUSDT',
      D(48_900),
      s.pendingOrders.slice(0, 0),
      s.pendingOrders,
      mark(50_900)
    );
    expect(hits.map((h) => h.kind === 'fill' && h.orderId)).toEqual([limit.id]);
    expect(evaluateTick('linear', 'BTCUSDT', D(51_500), [], s.pendingOrders, mark(50_900))).toEqual(
      []
    );
    const [t] = evaluateTick('linear', 'BTCUSDT', D(50_000), [], s.pendingOrders, mark(51_000));
    expect(t).toMatchObject({ kind: 'fill', orderId: stop.id, by: 'MarkPrice' });
  });

  it('backfill: an index leg reads the index candle and is skipped without one', () => {
    const s = withLong({ takeProfit: D(52_000), tpTriggerBy: 'IndexPrice' });
    const start = s.positions[0].openedAt + 60_000;
    const last = { start, high: D(53_000), low: D(50_000) };
    expect(evaluateCandle('linear', 'BTCUSDT', last, s.positions, [])).toEqual([]);
    const index = { start, high: D(52_100), low: D(50_000) };
    const [t] = evaluateCandle('linear', 'BTCUSDT', last, s.positions, [], undefined, index);
    expect(t).toMatchObject({ kind: 'exit', leg: 'take-profit', by: 'IndexPrice' });
    expect(t.fillAt?.toString()).toBe('52000');
  });

  it('an order TP / SL with a trigger source is attached to the position with it; a new LastPrice leg drops it', () => {
    let s = withLong({ takeProfit: D(55_000), tpTriggerBy: 'MarkPrice' });
    expect(s.positions[0].tpTriggerBy).toBe('MarkPrice');
    [s] = run(
      s,
      placeMarket(
        s,
        { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') }, takeProfit: D(56_000) },
        flat(50_000),
        RULES,
        ctx()
      )
    );
    expect(s.positions[0].takeProfit?.toString()).toBe('56000');
    expect(s.positions[0].tpTriggerBy).toBeUndefined();
  });
});

// ─── TP / SL side (O9) ─────────────────────────────────────────────────────────

describe('BP-5 B — TP / SL must be on the right side of the base price (O9)', () => {
  it('a limit / stop order is checked against its own price', () => {
    const res = placePending(
      account(),
      {
        symbol: 'BTCUSDT',
        side: 'sell',
        type: 'limit',
        triggerPrice: D(52_000),
        size: { qty: D('0.1') },
        takeProfit: D(53_000),
      },
      flat(50_000),
      RULES,
      ctx()
    );
    expect(res.invalid).toBe(
      'TakeProfit:53000 set for Sell position should be lower than base_price:52000??LastPrice'
    );
  });

  it('a position edit is checked against the current price of the leg source', () => {
    const s = withLong();
    const id = s.positions[0].id;
    const prices = { last: D(50_000), mark: D(49_000), index: D(49_500) };
    // SL 49,500 on the mark (49,000): wrong side
    expect(
      updatePositionExits(s, id, null, D(49_500), ctx(), { slTriggerBy: 'MarkPrice', prices })
        .invalid
    ).toBe('StopLoss:49500 set for Buy position should be lower than base_price:49000??MarkPrice');
    // The same level on the last price (50,000) is fine
    const ok = updatePositionExits(s, id, null, D(49_500), ctx(), { prices });
    expect(ok.invalid).toBeUndefined();
    expect(ok.result).toBe(true);
  });

  it('an untouched leg is not re-checked; a missing source price refuses a changed one', () => {
    let s = withLong({ takeProfit: D(52_000) });
    const id = s.positions[0].id;
    // Price ran past the TP; removing the SL alone must still work
    [s] = run(
      s,
      updatePositionExits(s, id, D(52_000), null, ctx(), { prices: { last: D(53_000) } })
    );
    expect(
      updatePositionExits(s, id, D(52_000), D(48_000), ctx(), {
        slTriggerBy: 'IndexPrice',
        prices: { last: D(50_000) },
      }).invalid
    ).toBe(REJECT_EXIT_NO_PRICE);
  });

  it('a stop-loss beyond the liquidation price is accepted (the client warns)', () => {
    const s = withLong();
    const res = updatePositionExits(s, s.positions[0].id, null, D(44_000), ctx(), {
      prices: { last: D(50_000) },
    });
    expect(res.invalid).toBeUndefined();
  });
});

// ─── Reduce-only / close-on-trigger ────────────────────────────────────────────

describe('BP-5 B — reduce-only and close-on-trigger', () => {
  it('a reduce-only market order is capped at the position and never flips it', () => {
    const s0 = withLong();
    const [s] = run(
      s0,
      placeMarket(
        s0,
        { symbol: 'BTCUSDT', side: 'sell', size: { qty: D('0.3') }, reduceOnly: true },
        flat(51_000),
        RULES,
        ctx()
      )
    );
    expect(s.positions).toEqual([]);
    // Closed at 51,000: IM 500 + reserve back, +100 PnL − close fee
    expect(s.balance.gt(s0.balance.plus(500))).toBe(true);
  });

  it('refuses reduce-only with no position, on the position own side, or with TP / SL', () => {
    const mk = (state: AccountState, side: 'buy' | 'sell', extra = {}) =>
      placeMarket(
        state,
        { symbol: 'BTCUSDT', side, size: { qty: D('0.1') }, reduceOnly: true, ...extra },
        flat(50_000),
        RULES,
        ctx()
      ).invalid;
    expect(mk(account(), 'sell')).toBe(REJECT_REDUCE_ONLY_NO_POSITION);
    expect(mk(withLong(), 'buy')).toBe(REJECT_REDUCE_ONLY_SIDE);
    expect(mk(withLong(), 'sell', { stopLoss: D(60_000) })).toBe(REJECT_REDUCE_ONLY_TPSL);
  });

  it('a resting reduce-only / close-on-trigger order reserves nothing and is capped at the position', () => {
    const s0 = withLong();
    const [s] = run(
      s0,
      placePending(
        s0,
        {
          symbol: 'BTCUSDT',
          side: 'sell',
          type: 'stop',
          triggerPrice: D(48_000),
          size: { qty: D('0.5') },
          closeOnTrigger: true,
        },
        undefined,
        RULES,
        ctx()
      )
    );
    const [o] = s.pendingOrders;
    expect(o).toMatchObject({ reduceOnly: true, closeOnTrigger: true }); // implies reduce-only
    expect(o.qty.toString()).toBe('0.1');
    expect(o.reserved.toString()).toBe('0');
    expect(s.balance.eq(s0.balance)).toBe(true);
    // A leverage change leaves it holding nothing
    const [s2] = run(s, setSymbolLeverage(s, 'BTCUSDT', 5, ctx(), D(50_000)));
    expect(s2.pendingOrders[0].reserved.toString()).toBe('0');
  });

  it('when the position shrinks, the reduce-only orders furthest from the price are trimmed, then cancelled', () => {
    let s = withLong();
    const place = (price: number, qty: string) =>
      placePending(
        s,
        {
          symbol: 'BTCUSDT',
          side: 'sell',
          type: 'limit',
          triggerPrice: D(price),
          size: { qty: D(qty) },
          reduceOnly: true,
        },
        flat(50_000),
        RULES,
        ctx()
      );
    [s] = run(s, place(51_000, '0.06'));
    // 0.06 + 0.06 > 0.1: the new, further order is trimmed to what's left
    [s] = run(s, place(55_000, '0.06'));
    const qtyAt = (p: number) => s.pendingOrders.find((o) => o.triggerPrice.eq(p))?.qty.toString();
    expect(qtyAt(51_000)).toBe('0.06');
    expect(qtyAt(55_000)).toBe('0.04');
    // A plain sell of 0.05 at market shrinks the position to 0.05
    [s] = run(
      s,
      placeMarket(
        s,
        { symbol: 'BTCUSDT', side: 'sell', size: { qty: D('0.05') } },
        flat(50_000),
        RULES,
        ctx()
      )
    );
    expect(qtyAt(51_000)).toBe('0.05');
    expect(qtyAt(55_000)).toBeUndefined();
    // Closing the position cancels what's left
    const res = closePosition(s, s.positions[0].id, flat(50_000), ctx());
    [s] = run(s, res);
    expect(s.pendingOrders).toEqual([]);
    expect(res.delta.orders.some((o) => o.status === 'cancelled' && o.reduceOnly)).toBe(true);
    expect(res.delta.journal.some((j) => j.text.includes('no position left to reduce'))).toBe(true);
  });

  it('a triggered reduce-only order with nothing to reduce is cancelled, not filled', () => {
    let s = withLong();
    [s] = run(
      s,
      placePending(
        s,
        {
          symbol: 'BTCUSDT',
          side: 'sell',
          type: 'stop',
          triggerPrice: D(48_000),
          size: { qty: D('0.1') },
          reduceOnly: true,
        },
        undefined,
        RULES,
        ctx()
      )
    );
    // The position vanished without the order being trimmed (e.g. a stale index)
    const orphan: AccountState = { ...s, positions: [] };
    const res = fillPending(
      orphan,
      s.pendingOrders[0].id,
      { price: D(48_000), isMaker: false },
      ctx()
    );
    expect(res.result).toBeNull();
    const after = applyDelta(orphan, res.delta);
    expect(after.pendingOrders).toEqual([]);
    expect(after.positions).toEqual([]);
    expect(res.delta.orders[0]).toMatchObject({ status: 'cancelled', reduceOnly: true });
  });

  it('a reduce-only edit keeps reserving nothing and refuses TP / SL', () => {
    let s = withLong();
    [s] = run(
      s,
      placePending(
        s,
        {
          symbol: 'BTCUSDT',
          side: 'sell',
          type: 'limit',
          triggerPrice: D(52_000),
          size: { qty: D('0.05') },
          reduceOnly: true,
        },
        flat(50_000),
        RULES,
        ctx()
      )
    );
    const id = s.pendingOrders[0].id;
    const edit = (tp: Decimal | null) =>
      editPending(
        s,
        id,
        { triggerPrice: D(53_000), size: { qty: D('0.2') }, takeProfit: tp, stopLoss: null },
        flat(50_000),
        RULES,
        ctx()
      );
    expect(edit(D(40_000)).invalid).toBe(REJECT_REDUCE_ONLY_TPSL);
    [s] = run(s, edit(null));
    expect(s.pendingOrders[0].qty.toString()).toBe('0.1');
    expect(s.pendingOrders[0].reserved.toString()).toBe('0');
  });
});
