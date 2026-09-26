/**
 * BP-2 spot engine — worked numbers (docs/TRADING_TEST_PLAN.md §10).
 *
 * One USDT wallet plus coin balances. Bybit spot fee 0.1% in the asset received; market buys at
 * the ask, sells at the bid; no shorting; TP / SL as an OCO pair of conditional sells.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  REJECT_SL_ABOVE,
  REJECT_TP_BELOW,
  applyDelta,
  cancelPending,
  cancelPendingExitLeg,
  editSpotLimit,
  evaluateCandle,
  evaluateTick,
  executeTrigger,
  placeSpotExits,
  placeSpotLimit,
  placeSpotMarket,
  resetAccount,
  type AccountState,
  type ActionResult,
  type InstrumentRules,
} from '../index.js';

const D = (v: number | string) => new Decimal(v);
let n = 0;
const ctx = () => ({ now: 1_800_000_000_000 + ++n, newId: () => `id${++n}` });
const quote = (bid: number, ask: number, last = (bid + ask) / 2) => ({
  last: D(last),
  bid: D(bid),
  ask: D(ask),
});
const expectDec = (actual: Decimal | undefined, expected: string) =>
  expect(actual?.toString()).toBe(D(expected).toString());

/** Bybit's BTCUSDT spot rules (instruments-info) */
const RULES: InstrumentRules = {
  tickSize: D('0.1'),
  qtyStep: D('0.000001'),
  minOrderQty: D('0.000001'),
  minNotional: D(5),
};

const fresh = (): AccountState => ({
  balance: D(10_000),
  realizedPnl: D(0),
  leverage: 1,
  symbolLeverage: {},
  spot: [],
  positions: [],
  pendingOrders: [],
});

/** Apply an action and return the next state (asserting it wasn't refused). */
function run<R>(state: AccountState, res: ActionResult<R>): AccountState {
  expect(res.invalid).toBeUndefined();
  return applyDelta(state, res.delta);
}

const btc = (s: AccountState) => s.spot.find((h) => h.coin === 'BTC');

function boughtTenth(): AccountState {
  return run(
    fresh(),
    placeSpotMarket(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') } },
      quote(49_990, 50_000),
      RULES,
      ctx()
    )
  );
}

describe('spot market buy — 0.1 BTC at ask 50,000', () => {
  const res = placeSpotMarket(
    fresh(),
    { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') } },
    quote(49_990, 50_000),
    RULES,
    ctx()
  );
  const after = applyDelta(fresh(), res.delta);

  it('pays 5,000 USDT; receives 0.0999 BTC (0.1% fee in BTC)', () => {
    expectDec(after.balance, '5000');
    expectDec(btc(after)?.free, '0.0999');
    expectDec(btc(after)?.locked, '0');
  });

  it('average cost is 50,050.05 (fees included)', () => {
    expect(btc(after)?.avgCost.toFixed(2)).toBe('50050.05');
  });

  it('opens no position and records a taker fill with the fee in BTC', () => {
    expect(after.positions).toHaveLength(0);
    expect(res.delta.orders[0]).toMatchObject({
      category: 'spot',
      type: 'market',
      side: 'buy',
      feeAsset: 'BTC',
      isMaker: false,
    });
    expectDec(res.delta.orders[0].commission, '0.0001');
    expectDec(res.delta.orders[0].feeRate, '0.001');
  });

  it('"by value" converts USDT at the ask', () => {
    const byValue = placeSpotMarket(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', size: { value: D(5_000) } },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    expectDec(applyDelta(fresh(), byValue.delta).balance, '5000');
  });
});

describe('spot market sell — 0.0999 BTC at bid 51,000', () => {
  const start = boughtTenth();
  const res = placeSpotMarket(
    start,
    { symbol: 'BTCUSDT', side: 'sell', size: { qty: D('0.0999') } },
    quote(51_000, 51_010),
    RULES,
    ctx()
  );
  const after = applyDelta(start, res.delta);

  it('fee 5.0949 USDT; +5,089.8051 USDT; the BTC balance is empty', () => {
    expectDec(res.delta.orders[0].commission, '5.0949');
    expect(res.delta.orders[0].feeAsset).toBe('USDT');
    expectDec(after.balance.minus(start.balance), '5089.8051');
    expectDec(btc(after)?.free, '0');
    expectDec(btc(after)?.avgCost, '0');
  });

  it('realized PnL +89.8051, written as a closed spot trade', () => {
    expect(after.realizedPnl.toNumber()).toBeCloseTo(89.8051, 5);
    expect(res.delta.trades[0]).toMatchObject({ category: 'spot', side: 'long' });
    expectDec(res.delta.trades[0].exitPrice, '51000');
    expect(res.sound).toBe('profit');
  });

  it('F8: selling coins you do not hold is refused, nothing written', () => {
    const r = placeSpotMarket(
      fresh(),
      { symbol: 'BTCUSDT', side: 'sell', size: { qty: D('0.1') } },
      quote(51_000, 51_010),
      RULES,
      ctx()
    );
    expect(r.invalid).toBe('Balance insufficient (0.000000 BTC available)');
    expect(r.delta.orders).toHaveLength(0);
  });

  it('a buy beyond the USDT balance is refused', () => {
    const r = placeSpotMarket(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D(1) } },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    expect(r.invalid).toBe('Balance insufficient (10000.00 USDT available)');
  });
});

describe('spot limit orders', () => {
  it('a resting buy 0.1 @ 49,000 reserves 4,900 USDT', () => {
    const res = placeSpotLimit(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', triggerPrice: D(49_000), size: { qty: D('0.1') } },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    const after = run(fresh(), res);
    expectDec(after.balance, '5100');
    expectDec(after.pendingOrders[0].reserved, '4900');
    expect(after.pendingOrders[0]).toMatchObject({ category: 'spot', type: 'limit' });
    expect(res.sound).toBe('queued');
  });

  it('fills at its own price as maker and spends exactly the reserve', () => {
    const placed = run(
      fresh(),
      placeSpotLimit(
        fresh(),
        { symbol: 'BTCUSDT', side: 'buy', triggerPrice: D(49_000), size: { qty: D('0.1') } },
        quote(49_990, 50_000),
        RULES,
        ctx()
      )
    );
    const order = placed.pendingOrders[0];
    const res = executeTrigger(
      placed,
      { kind: 'fill', orderId: order.id, price: D(48_950) },
      quote(48_940, 48_960),
      ctx()
    );
    const after = applyDelta(placed, res.delta);
    expectDec(after.balance, '5100');
    expectDec(btc(after)?.free, '0.0999');
    expect(res.delta.orders[0]).toMatchObject({ type: 'limit', isMaker: true, category: 'spot' });
    expectDec(res.delta.orders[0].fillPrice, '49000');
  });

  it('a resting sell 0.05 @ 52,000 locks 0.05 BTC; filled, it pays +2,597.40', () => {
    const start = boughtTenth();
    const placed = run(
      start,
      placeSpotLimit(
        start,
        { symbol: 'BTCUSDT', side: 'sell', triggerPrice: D(52_000), size: { qty: D('0.05') } },
        quote(49_990, 50_000),
        RULES,
        ctx()
      )
    );
    expectDec(btc(placed)?.free, '0.0499');
    expectDec(btc(placed)?.locked, '0.05');
    const order = placed.pendingOrders[0];
    const res = executeTrigger(
      placed,
      { kind: 'fill', orderId: order.id, price: D(52_010) },
      quote(52_000, 52_020),
      ctx()
    );
    const after = applyDelta(placed, res.delta);
    expectDec(after.balance.minus(placed.balance), '2597.4');
    expectDec(btc(after)?.locked, '0');
    expectDec(btc(after)?.free, '0.0499');
  });

  it('cancelling a resting sell releases the locked coins', () => {
    const start = boughtTenth();
    const placed = run(
      start,
      placeSpotLimit(
        start,
        { symbol: 'BTCUSDT', side: 'sell', triggerPrice: D(52_000), size: { qty: D('0.05') } },
        quote(49_990, 50_000),
        RULES,
        ctx()
      )
    );
    const after = run(placed, cancelPending(placed, placed.pendingOrders[0].id, ctx()));
    expectDec(btc(after)?.free, '0.0999');
    expectDec(btc(after)?.locked, '0');
    expectDec(after.balance, start.balance.toString()); // no USDT "refund" for a coin lock
  });

  it('a buy limit above the ask crosses: fills now at the ask as taker', () => {
    const res = placeSpotLimit(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', triggerPrice: D(50_100), size: { qty: D('0.1') } },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    expect(res.delta.pendingUpsert).toHaveLength(0);
    expect(res.delta.orders[0]).toMatchObject({ type: 'limit', isMaker: false });
    expectDec(res.delta.orders[0].fillPrice, '50000');
    expectDec(res.delta.orders[0].limitPrice, '50100');
  });

  it('editing a resting buy re-reserves at the new price and keeps its id', () => {
    const placed = run(
      fresh(),
      placeSpotLimit(
        fresh(),
        { symbol: 'BTCUSDT', side: 'buy', triggerPrice: D(49_000), size: { qty: D('0.1') } },
        quote(49_990, 50_000),
        RULES,
        ctx()
      )
    );
    const id = placed.pendingOrders[0].id;
    const res = editSpotLimit(
      placed,
      id,
      { triggerPrice: D(48_000), size: { qty: D('0.2') }, takeProfit: null, stopLoss: null },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    const after = run(placed, res);
    expect(after.pendingOrders.map((o) => o.id)).toEqual([id]);
    expectDec(after.pendingOrders[0].reserved, '9600');
    expectDec(after.balance, '400');
  });

  it('an edit the balance cannot cover is refused and changes nothing', () => {
    const placed = run(
      fresh(),
      placeSpotLimit(
        fresh(),
        { symbol: 'BTCUSDT', side: 'buy', triggerPrice: D(49_000), size: { qty: D('0.1') } },
        quote(49_990, 50_000),
        RULES,
        ctx()
      )
    );
    const res = editSpotLimit(
      placed,
      placed.pendingOrders[0].id,
      { triggerPrice: D(49_000), size: { qty: D(1) }, takeProfit: null, stopLoss: null },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    expect(res.invalid).toContain('Balance insufficient');
    expect(res.delta.pendingUpsert).toHaveLength(0);
  });
});

describe('spot TP / SL — an OCO pair sharing one coin lock', () => {
  function withExits(): AccountState {
    const res = placeSpotMarket(
      fresh(),
      {
        symbol: 'BTCUSDT',
        side: 'buy',
        size: { qty: D('0.1') },
        takeProfit: D(55_000),
        stopLoss: D(45_000),
      },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    return run(fresh(), res);
  }

  it('a buy with TP / SL locks what it received behind two conditional sells', () => {
    const s = withExits();
    expectDec(btc(s)?.free, '0');
    expectDec(btc(s)?.locked, '0.0999');
    expect(s.pendingOrders.map((o) => o.type).sort()).toEqual(['stop-loss', 'take-profit']);
    const [a, b] = s.pendingOrders;
    expect(a.ocoGroup).toBeDefined();
    expect(a.ocoGroup).toBe(b.ocoGroup);
    expectDec(a.qty, '0.0999');
  });

  it('TP triggers on the last price, sells at the bid, cancels the SL; lock used up', () => {
    const s = withExits();
    const [trigger] = evaluateTick('spot', 'BTCUSDT', D(55_000), s.positions, s.pendingOrders);
    expect(trigger).toMatchObject({ kind: 'fill' });
    const res = executeTrigger(s, trigger, quote(54_990, 55_010, 55_000), ctx());
    const after = applyDelta(s, res.delta);
    expect(after.pendingOrders).toHaveLength(0);
    expectDec(btc(after)?.locked, '0');
    expectDec(btc(after)?.free, '0');
    expectDec(res.delta.trades[0].exitPrice, '54990');
    expect(res.delta.orders.some((o) => o.status === 'cancelled' && o.type === 'stop-loss')).toBe(
      true
    );
    expect(res.delta.journal.some((j) => j.text.includes('Take-Profit hit at $54990.00'))).toBe(
      true
    );
    expect(res.sound).toBe('profit');
  });

  it('SL triggers on a drop and sells at the bid', () => {
    const s = withExits();
    const [trigger] = evaluateTick('spot', 'BTCUSDT', D(45_000), s.positions, s.pendingOrders);
    const res = executeTrigger(s, trigger, quote(44_980, 45_000, 45_000), ctx());
    expectDec(res.delta.trades[0].exitPrice, '44980');
    expect(res.sound).toBe('loss');
  });

  it('cancelling one leg keeps the lock for the other; cancelling both releases it', () => {
    const s = withExits();
    const [first, second] = s.pendingOrders;
    const one = run(s, cancelPending(s, first.id, ctx()));
    expectDec(btc(one)?.locked, '0.0999');
    const both = run(one, cancelPending(one, second.id, ctx()));
    expectDec(btc(both)?.locked, '0');
    expectDec(btc(both)?.free, '0.0999');
  });

  it('a USDT Perpetual tick never triggers a spot leg', () => {
    const s = withExits();
    expect(evaluateTick('linear', 'BTCUSDT', D(60_000), s.positions, s.pendingOrders)).toHaveLength(
      0
    );
  });

  it('backfill: a candle reaching the TP fills at the TP level', () => {
    const s = withExits();
    const [trigger] = evaluateCandle(
      'spot',
      'BTCUSDT',
      { start: 1_900_000_000_000, low: D(50_000), high: D(55_500) },
      s.positions,
      s.pendingOrders
    );
    const res = executeTrigger(s, trigger, undefined, ctx());
    expectDec(res.delta.trades[0].exitPrice, '55000');
  });

  it('refuses a TP at or below, or an SL at or above, the current price', () => {
    const tp = placeSpotMarket(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') }, takeProfit: D(49_000) },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    expect(tp.invalid).toBe(REJECT_TP_BELOW);
    const sl = placeSpotMarket(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') }, stopLoss: D(51_000) },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    expect(sl.invalid).toBe(REJECT_SL_ABOVE);
  });

  it('TP / SL on coins already held lock only the requested quantity', () => {
    const start = boughtTenth();
    const res = placeSpotExits(
      start,
      { symbol: 'BTCUSDT', qty: D('0.05'), stopLoss: D(45_000) },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    const after = run(start, res);
    expectDec(btc(after)?.free, '0.0499');
    expectDec(btc(after)?.locked, '0.05');
    expect(after.pendingOrders).toHaveLength(1);
  });

  it('a limit buy with TP / SL places the pair once it fills', () => {
    const placed = run(
      fresh(),
      placeSpotLimit(
        fresh(),
        {
          symbol: 'BTCUSDT',
          side: 'buy',
          triggerPrice: D(49_000),
          size: { qty: D('0.1') },
          takeProfit: D(55_000),
        },
        quote(49_990, 50_000),
        RULES,
        ctx()
      )
    );
    const order = placed.pendingOrders[0];
    const after = applyDelta(
      placed,
      executeTrigger(
        placed,
        { kind: 'fill', orderId: order.id, price: D(49_000) },
        undefined,
        ctx()
      ).delta
    );
    expect(after.pendingOrders.map((o) => o.type)).toEqual(['take-profit']);
    expectDec(btc(after)?.locked, '0.0999');
  });
});

describe('spot rules and reset', () => {
  it('refuses a spot order below Bybit’s 5 USDT minimum value', () => {
    const res = placeSpotMarket(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.00005') } },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    expect(res.invalid).toBe('Order value exceeded lower limit (5 USDT)');
  });

  it('rounds the quantity down to the base precision', () => {
    const res = placeSpotMarket(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.12345678') } },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    expectDec(res.delta.orders[0].qty, '0.123456');
  });

  it('coin fees stay on the stored 8-decimal grid', () => {
    const res = placeSpotMarket(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.000123') } },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    expectDec(res.delta.orders[0].commission, '0.00000013'); // 0.000000123 rounded up
    expect(res.delta.spotUpsert[0].free.decimalPlaces()).toBeLessThanOrEqual(8);
  });

  it('a reset wipes the coin balances', () => {
    const s = boughtTenth();
    const after = applyDelta(s, resetAccount(s).delta);
    expect(after.spot).toEqual([]);
    expectDec(after.balance, '10000');
  });
});

describe('spot — review fixes', () => {
  it('a backfilled candle spanning both legs sells at the TP (TP wins, as on perpetual)', () => {
    const s = run(
      fresh(),
      placeSpotMarket(
        fresh(),
        {
          symbol: 'BTCUSDT',
          side: 'buy',
          size: { qty: D('0.1') },
          takeProfit: D(55_000),
          stopLoss: D(45_000),
        },
        quote(49_990, 50_000),
        RULES,
        ctx()
      )
    );
    const [first] = evaluateCandle(
      'spot',
      'BTCUSDT',
      { start: 1_900_000_000_000, low: D(44_000), high: D(56_000) },
      s.positions,
      s.pendingOrders
    );
    const res = executeTrigger(s, first, undefined, ctx());
    expectDec(res.delta.trades[0].exitPrice, '55000');
  });

  it("removing a resting spot buy's TP writes a Spot cancel row", () => {
    const placed = run(
      fresh(),
      placeSpotLimit(
        fresh(),
        {
          symbol: 'BTCUSDT',
          side: 'buy',
          triggerPrice: D(49_000),
          size: { qty: D('0.1') },
          takeProfit: D(55_000),
        },
        quote(49_990, 50_000),
        RULES,
        ctx()
      )
    );
    const res = cancelPendingExitLeg(placed, placed.pendingOrders[0].id, 'take-profit', ctx());
    expect(res.delta.orders[0]).toMatchObject({ category: 'spot', type: 'take-profit' });
  });

  it("refuses a resting buy's TP / SL off the tick grid", () => {
    const res = placeSpotLimit(
      fresh(),
      {
        symbol: 'BTCUSDT',
        side: 'buy',
        triggerPrice: D(49_000),
        size: { qty: D('0.1') },
        takeProfit: D('55000.05'),
      },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    expect(res.invalid).toBe('Order price decimal too long (tick size 0.1)');
  });

  it('a spot sell credits USDT on the 8-decimal grid', () => {
    const start = boughtTenth();
    const res = placeSpotMarket(
      start,
      { symbol: 'BTCUSDT', side: 'sell', size: { qty: D('0.012345') } },
      quote(51_000.3, 51_010),
      RULES,
      ctx()
    );
    expect(res.delta.account.balance.decimalPlaces()).toBeLessThanOrEqual(8);
    expect(res.delta.orders[0].commission.decimalPlaces()).toBeLessThanOrEqual(8);
  });

  it('editing a resting spot sell releases the old lock and takes the new one', () => {
    const start = boughtTenth();
    const placed = run(
      start,
      placeSpotLimit(
        start,
        { symbol: 'BTCUSDT', side: 'sell', triggerPrice: D(52_000), size: { qty: D('0.05') } },
        quote(49_990, 50_000),
        RULES,
        ctx()
      )
    );
    const id = placed.pendingOrders[0].id;
    const after = run(
      placed,
      editSpotLimit(
        placed,
        id,
        { triggerPrice: D(53_000), size: { qty: D('0.08') }, takeProfit: null, stopLoss: null },
        quote(49_990, 50_000),
        RULES,
        ctx()
      )
    );
    expectDec(btc(after)?.locked, '0.08');
    expectDec(btc(after)?.free, '0.0199');
    expect(after.pendingOrders.map((o) => o.id)).toEqual([id]);
    expectDec(after.balance, start.balance.toString());
  });

  it('a spot sell edited across the book sells now at the bid', () => {
    const start = boughtTenth();
    const placed = run(
      start,
      placeSpotLimit(
        start,
        { symbol: 'BTCUSDT', side: 'sell', triggerPrice: D(52_000), size: { qty: D('0.05') } },
        quote(49_990, 50_000),
        RULES,
        ctx()
      )
    );
    const res = editSpotLimit(
      placed,
      placed.pendingOrders[0].id,
      { triggerPrice: D(49_000), size: { qty: D('0.05') }, takeProfit: null, stopLoss: null },
      quote(49_990, 50_000),
      RULES,
      ctx()
    );
    const after = run(placed, res);
    expect(after.pendingOrders).toHaveLength(0);
    expectDec(res.delta.trades[0].exitPrice, '49990');
    expectDec(btc(after)?.locked, '0');
    expectDec(btc(after)?.free, '0.0499');
  });
});

describe('PR #136 review — a crossing limit is priced at the book, not the limit', () => {
  it('a buy limit above the ask is affordable at the ask even when qty × limit is not', () => {
    // 1,000 USDT; ask 95; 10 @ limit 110 → costs 950 now (not 1,100)
    const state = { ...fresh(), balance: D(1_000) };
    const res = placeSpotLimit(
      state,
      { symbol: 'BTCUSDT', side: 'buy', triggerPrice: D(110), size: { qty: D(10) } },
      quote(94, 95),
      { ...RULES, minNotional: D(0) },
      ctx()
    );
    expect(res.invalid).toBeUndefined();
    expectDec(applyDelta(state, res.delta).balance, '50');
    expectDec(res.delta.orders[0].fillPrice, '95');
  });

  it('a resting buy still needs qty × limit', () => {
    const state = { ...fresh(), balance: D(1_000) };
    const res = placeSpotLimit(
      state,
      { symbol: 'BTCUSDT', side: 'buy', triggerPrice: D(90), size: { qty: D(12) } },
      quote(94, 95),
      { ...RULES, minNotional: D(0) },
      ctx()
    );
    expect(res.invalid).toContain('Balance insufficient');
  });
});
