/**
 * BP-2 USDT Perpetual fees and fill prices — worked numbers (docs/TRADING_TEST_PLAN.md §11–12).
 *
 * Bybit VIP-0: taker 0.055%, maker 0.02%, on notional (qty × price). Opening costs initial margin
 * + open fee + Bybit's estimated fee to close (taker, priced at the bankruptcy price
 * entry × (1 ∓ 1/leverage) since BP-3), which stays with the position and comes back at close.
 * Stored fees are never recomputed: a pre-BP-2 position closes against the 0.07% it paid.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  REJECT_LEVERAGE_BALANCE,
  REJECT_LEVERAGE_LIQUIDATION,
  REJECT_LEVERAGE_NO_MARK,
  cancelPending,
  closePosition,
  editPending,
  executeTrigger,
  placeMarket,
  placePending,
  setSymbolLeverage,
  type AccountState,
  type InstrumentRules,
  type PendingOrder,
  type Position,
} from '../index.js';
import { OPEN_RULES } from './harness.js';

const D = (v: number | string) => new Decimal(v);
const ctx = { now: 1_800_000_000_000, newId: () => 'id1' };
const quote = (bid: number, ask: number, last = (bid + ask) / 2) => ({
  last: D(last),
  bid: D(bid),
  ask: D(ask),
});

/** Exact decimal comparison, so a rounding drift can't hide behind toBeCloseTo */
const expectDec = (actual: Decimal | undefined, expected: string) =>
  expect(actual?.toString()).toBe(D(expected).toString());

function account(overrides: Partial<AccountState> = {}): AccountState {
  return {
    balance: D(10_000),
    realizedPnl: D(0),
    leverage: 1,
    symbolLeverage: { BTCUSDT: 10 },
    symbolFundingAt: {},
    spot: [],
    positions: [],
    pendingOrders: [],
    ...overrides,
  };
}

/** Bybit's BTCUSDT perpetual rules (instruments-info) */
const BTC_RULES: InstrumentRules = {
  tickSize: D('0.1'),
  qtyStep: D('0.001'),
  minOrderQty: D('0.001'),
  minNotional: D(5),
};

describe('market open — 10×, qty 0.1 at ask 50,000', () => {
  const res = placeMarket(
    account(),
    { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') } },
    quote(49_990, 50_000),
    BTC_RULES,
    ctx
  );
  const pos = res.delta.positionsUpsert[0];

  it('fills at the ask', () => {
    expectDec(pos.entryPrice, '50000');
  });

  it('IM 500, open fee 2.75, fee to close 5,000 × 0.9 × 0.055% = 2.475 → costs 505.225', () => {
    expectDec(pos.entryUsdtAmount, '500');
    expectDec(pos.entryFee, '2.75');
    expectDec(pos.closeFeeReserve, '2.475');
    expectDec(res.delta.account.balance, '9494.775');
    expect(pos.leverage).toBe(10);
  });

  it('records the fill as a taker at 0.055% in USDT', () => {
    expect(res.delta.orders[0]).toMatchObject({ type: 'market', isMaker: false, feeAsset: 'USDT' });
    expectDec(res.delta.orders[0].feeRate, '0.00055');
    expectDec(res.delta.orders[0].commission, '2.75');
  });

  it('closing at bid 51,000: close fee 2.805, +599.67 back, realized +94.445', () => {
    const open = account({ balance: res.delta.account.balance, positions: [pos] });
    const closed = closePosition(open, pos.id, quote(51_000, 51_010), ctx);
    expectDec(closed.delta.trades[0].exitPrice, '51000');
    expectDec(closed.delta.trades[0].exitCommission, '2.805');
    expectDec(closed.delta.account.balance.minus(open.balance), '599.67');
    expectDec(closed.delta.account.realizedPnl, '94.445');
  });

  it('a short closes at the ask', () => {
    const short = placeMarket(
      account(),
      { symbol: 'BTCUSDT', side: 'sell', size: { qty: D('0.1') } },
      quote(49_990, 50_000),
      BTC_RULES,
      ctx
    ).delta.positionsUpsert[0];
    expectDec(short.entryPrice, '49990'); // a sell fills at the bid
    const closed = closePosition(
      account({ positions: [short] }),
      short.id,
      quote(48_000, 48_010),
      ctx
    );
    expectDec(closed.delta.trades[0].exitPrice, '48010');
  });
});

describe('resting limit — fills at its own price as maker (F4)', () => {
  const placed = placePending(
    account(),
    {
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'limit',
      triggerPrice: D(49_000),
      size: { qty: D('0.1') },
    },
    quote(49_990, 50_000),
    BTC_RULES,
    ctx
  );
  const order = placed.delta.pendingUpsert[0];

  it('reserves IM 490 + taker open fee 2.695 + fee to close 2.4255 = 495.1205', () => {
    expectDec(order.reserved, '495.1205');
    expectDec(placed.delta.account.balance, '9504.8795');
  });

  it('fills at 49,000 (not the tick) with a 0.98 maker fee: net −493.4055', () => {
    const state = account({ balance: placed.delta.account.balance, pendingOrders: [order] });
    const filled = executeTrigger(
      state,
      { kind: 'fill', orderId: order.id, price: D(48_950) },
      quote(48_940, 48_960),
      ctx
    );
    const pos = filled.delta.positionsUpsert[0];
    expectDec(pos.entryPrice, '49000');
    expectDec(pos.entryFee, '0.98');
    expect(filled.delta.orders[0]).toMatchObject({ type: 'limit', isMaker: true });
    expectDec(filled.delta.orders[0].feeRate, '0.0002');
    expectDec(D(10_000).minus(filled.delta.account.balance), '493.4055');
  });

  it('cancel refunds exactly the reserve', () => {
    const state = account({ balance: placed.delta.account.balance, pendingOrders: [order] });
    expectDec(cancelPending(state, order.id, ctx).delta.account.balance, '10000');
  });
});

describe('crossing limit — trades now as a taker', () => {
  it('a buy limit at 50,100 with the ask at 50,000 fills at 50,000, no pending order', () => {
    const res = placePending(
      account(),
      {
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'limit',
        triggerPrice: D(50_100),
        size: { qty: D('0.1') },
      },
      quote(49_990, 50_000),
      BTC_RULES,
      ctx
    );
    expect(res.delta.pendingUpsert).toHaveLength(0);
    expectDec(res.delta.positionsUpsert[0].entryPrice, '50000');
    expectDec(res.delta.positionsUpsert[0].entryFee, '2.75');
    expect(res.delta.orders[0]).toMatchObject({ type: 'limit', isMaker: false });
    expectDec(res.delta.orders[0].limitPrice, '50100');
    expect(res.sound).toBe('placed');
  });

  it('a limit edited across the book fills now', () => {
    const placed = placePending(
      account(),
      {
        symbol: 'BTCUSDT',
        side: 'sell',
        type: 'limit',
        triggerPrice: D(52_000),
        size: { qty: D('0.1') },
      },
      quote(49_990, 50_000),
      BTC_RULES,
      ctx
    );
    const order = placed.delta.pendingUpsert[0];
    const state = account({ balance: placed.delta.account.balance, pendingOrders: [order] });
    const res = editPending(
      state,
      order.id,
      { triggerPrice: D(49_000), size: { qty: D('0.1') }, takeProfit: null, stopLoss: null },
      quote(49_990, 50_000),
      BTC_RULES,
      ctx
    );
    expect(res.result).toBe('ok');
    expect(res.delta.pendingRemove).toEqual([order.id]);
    expectDec(res.delta.positionsUpsert[0].entryPrice, '49990'); // sells hit the bid
  });
});

describe('stop — triggers on last, fills at the ask as taker', () => {
  it('trigger 50,500, last 50,500, ask 50,510 → fills at 50,510, fee 2.77805', () => {
    const placed = placePending(
      account(),
      {
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'stop',
        triggerPrice: D(50_500),
        size: { qty: D('0.1') },
      },
      undefined,
      BTC_RULES,
      ctx
    );
    const order = placed.delta.pendingUpsert[0];
    const res = executeTrigger(
      account({ balance: placed.delta.account.balance, pendingOrders: [order] }),
      { kind: 'fill', orderId: order.id, price: D(50_500) },
      quote(50_490, 50_510, 50_500),
      ctx
    );
    expectDec(res.delta.positionsUpsert[0].entryPrice, '50510');
    expectDec(res.delta.orders[0].commission, '2.77805');
  });
});

describe('never recompute: pre-BP-2 rows keep the 0.07% they paid', () => {
  const legacyPosition: Position = {
    id: 'legacy',
    category: 'linear',
    symbol: 'BTCUSDT',
    side: 'long',
    quantity: D('0.1'),
    entryPrice: D(50_000),
    entryUsdtAmount: D(1_000), // 5×
    leverage: 5,
    entryFee: D('0.7'), // 0.07% of margin, backfilled by the migration
    closeFeeReserve: D(0), // BP-1 reserved none
    openedAt: 0,
  };

  it('closing at bid 51,000: +1,097.195 back, realized +96.495 (BP-1 would have said 95.73)', () => {
    const res = closePosition(
      account({ positions: [legacyPosition] }),
      'legacy',
      quote(51_000, 51_010),
      ctx
    );
    expectDec(res.delta.account.balance.minus(10_000), '1097.195');
    expectDec(res.delta.account.realizedPnl, '96.495');
  });

  it('cancelling a pre-BP-2 pending order refunds its stored 1,000.70', () => {
    const legacyPending: PendingOrder = {
      id: 'legacy-p',
      category: 'linear',
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'limit',
      usdtAmount: D(1_000),
      reserved: D('1000.7'),
      triggerPrice: D(40_000),
      qty: D('0.025'),
      leverage: 1,
      placedAt: 0,
    };
    const res = cancelPending(account({ pendingOrders: [legacyPending] }), 'legacy-p', ctx);
    expectDec(res.delta.account.balance, '11000.7');
    expect(res.delta.journal[0].text).toContain('(refunded: $1000.70)');
  });
});

describe("Bybit's size rules (F9)", () => {
  const market = (size: { qty: Decimal } | { value: Decimal }, rules = BTC_RULES) =>
    placeMarket(
      account(),
      { symbol: 'BTCUSDT', side: 'buy', ...{ size } },
      quote(49_990, 50_000),
      rules,
      ctx
    );

  it('rounds the quantity down to the qty step', () => {
    expectDec(market({ qty: D('0.1239') }).delta.positionsUpsert[0].quantity, '0.123');
  });

  it('"by value" converts USDT notional at the fill price', () => {
    expectDec(market({ value: D(5_000) }).delta.positionsUpsert[0].quantity, '0.1');
  });

  it('refuses a quantity below the minimum, writing nothing', () => {
    const res = market({ qty: D('0.0009') });
    expect(res.invalid).toBe('Order quantity lower than the minimum (0.001)');
    expect(res.delta.orders).toHaveLength(0);
    expect(res.delta.positionsUpsert).toHaveLength(0);
  });

  it('refuses an order value below the minimum', () => {
    const res = market({ qty: D('0.001') }, { ...BTC_RULES, minNotional: D(100) });
    expect(res.invalid).toBe('Order notional value below the lower limit (100 USDT)');
  });

  it('refuses a limit price off the tick grid', () => {
    const res = placePending(
      account(),
      {
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'limit',
        triggerPrice: D('49000.05'),
        size: { qty: D('0.1') },
      },
      quote(49_990, 50_000),
      BTC_RULES,
      ctx
    );
    expect(res.invalid).toBe('Order price decimal too long (tick size 0.1)');
    expect(res.delta.pendingUpsert).toHaveLength(0);
  });
});

describe('per-symbol leverage', () => {
  it('a symbol uses its own leverage, others the account default', () => {
    const state = account({ leverage: 2, symbolLeverage: { BTCUSDT: 10 } });
    const btc = placeMarket(
      state,
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D(1) } },
      quote(100, 100),
      OPEN_RULES,
      ctx
    );
    const eth = placeMarket(
      state,
      { symbol: 'ETHUSDT', side: 'buy', size: { qty: D(1) } },
      quote(100, 100),
      OPEN_RULES,
      ctx
    );
    expectDec(btc.delta.positionsUpsert[0].entryUsdtAmount, '10');
    expectDec(eth.delta.positionsUpsert[0].entryUsdtAmount, '50');
  });

  it('sets the leverage of a symbol with no open trades', () => {
    const res = setSymbolLeverage(account(), 'ETHUSDT', 5, ctx);
    expect(res.result).toBe(5);
    expect(res.delta.account.symbolLeverage).toEqual({ BTCUSDT: 10, ETHUSDT: 5 });
  });

  it('clamps to [1, 10]', () => {
    expect(setSymbolLeverage(account(), 'ETHUSDT', 50, ctx).result).toBe(10);
  });
});

describe('leverage change with an open position — re-margining (BP-3)', () => {
  // Long 0.1 BTC @ 50,000 at 10×: IM 500, fee to close 2.475, balance 9,494.775
  const open = placeMarket(
    account(),
    { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') } },
    quote(49_990, 50_000),
    BTC_RULES,
    ctx
  );
  const state = (balance = open.delta.account.balance) =>
    account({ balance, positions: open.delta.positionsUpsert });

  it('lowering 10× → 5× moves IM 500 → 1,000 and re-estimates the fee to close (2.2)', () => {
    const res = setSymbolLeverage(state(), 'BTCUSDT', 5, ctx);
    expect(res.invalid).toBeUndefined();
    const pos = res.delta.positionsUpsert[0];
    expect(pos.leverage).toBe(5);
    expectDec(pos.entryUsdtAmount, '1000');
    expectDec(pos.closeFeeReserve, '2.2');
    // 1,002.2 − 502.475 = 499.725 more margin from the wallet
    expectDec(res.delta.account.balance, '8995.05');
    expect(res.delta.account.symbolLeverage).toEqual({ BTCUSDT: 5 });
    expect(res.delta.balanceEvents[0].action).toBe('Adjust margin for BTCUSDT: leverage 10x → 5x');
    expect(res.delta.journal[0].text).toBe(
      'Leverage for BTCUSDT changed 10x → 5x (margin added: $499.73)'
    );
  });

  it('lowering is refused when the wallet can not cover the extra margin', () => {
    const res = setSymbolLeverage(state(D(100)), 'BTCUSDT', 5, ctx);
    expect(res.invalid).toBe(REJECT_LEVERAGE_BALANCE);
    expect(res.delta.positionsUpsert).toHaveLength(0);
  });

  it('raising releases margin, and needs a live mark price', () => {
    const low = setSymbolLeverage(state(), 'BTCUSDT', 2, ctx);
    const at2x = account({
      balance: low.delta.account.balance,
      positions: low.delta.positionsUpsert,
      symbolLeverage: low.delta.account.symbolLeverage,
    });
    expect(setSymbolLeverage(at2x, 'BTCUSDT', 10, ctx).invalid).toBe(REJECT_LEVERAGE_NO_MARK);
    const res = setSymbolLeverage(at2x, 'BTCUSDT', 10, ctx, D(50_000));
    expectDec(res.delta.positionsUpsert[0].entryUsdtAmount, '500');
    expectDec(res.delta.account.balance, open.delta.account.balance.toString());
  });

  it('raising is refused when the mark price is already past the new liquidation price', () => {
    const low = setSymbolLeverage(state(), 'BTCUSDT', 2, ctx);
    const at2x = account({
      balance: low.delta.account.balance,
      positions: low.delta.positionsUpsert,
      symbolLeverage: low.delta.account.symbolLeverage,
    });
    // At 10× the liquidation price is ≈ 45,149; the mark is at 45,000
    const res = setSymbolLeverage(at2x, 'BTCUSDT', 10, ctx, D(45_000));
    expect(res.invalid).toBe(REJECT_LEVERAGE_LIQUIDATION);
  });

  it('re-reserves the symbol’s active orders at the new leverage', () => {
    const placed = placePending(
      account(),
      {
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'stop',
        triggerPrice: D(60_000),
        size: { qty: D('0.1') },
      },
      undefined,
      BTC_RULES,
      ctx
    );
    const withOrder = account({
      balance: placed.delta.account.balance,
      pendingOrders: placed.delta.pendingUpsert,
    });
    // 10×: 600 + 3.3 + 2.97 = 606.27; 3×: 2,000 + 3.3 + 2.2 = 2,005.5
    expectDec(placed.delta.pendingUpsert[0].reserved, '606.27');
    const res = setSymbolLeverage(withOrder, 'BTCUSDT', 3, ctx);
    const order = res.delta.pendingUpsert[0];
    expect(order.leverage).toBe(3);
    expectDec(order.reserved, '2005.5');
    expectDec(withOrder.balance.minus(res.delta.account.balance), '1399.23');
  });
});

describe('PR #136 review — editing a limit across the book is priced at the book', () => {
  it('a buy edited far above the ask fills at the ask even when a reserve at the new limit would not fit', () => {
    // 10×: 1 BTC at a 49,000 limit reserves ~4,954. Balance leaves no room for a reserve at
    // 110,000 (~11,121), but at the 50,000 ask the fill costs ~5,055 — affordable.
    const placed = placePending(
      account({ balance: D(6_000) }),
      {
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'limit',
        triggerPrice: D(49_000),
        size: { qty: D(1) },
      },
      quote(49_990, 50_000),
      BTC_RULES,
      ctx
    );
    const order = placed.delta.pendingUpsert[0];
    const res = editPending(
      account({ balance: placed.delta.account.balance, pendingOrders: [order] }),
      order.id,
      { triggerPrice: D(110_000), size: { qty: D(1) }, takeProfit: null, stopLoss: null },
      quote(49_990, 50_000),
      BTC_RULES,
      ctx
    );
    expect(res.result).toBe('ok');
    expectDec(res.delta.positionsUpsert[0].entryPrice, '50000');
    expect(res.delta.orders.some((o) => o.status === 'rejected')).toBe(false);
  });
});

describe('a pending order keeps its own leverage', () => {
  it('an edit keeps the leverage the order was placed with', () => {
    const placed = placePending(
      account({ leverage: 3, symbolLeverage: {} }),
      { symbol: 'ETHUSDT', side: 'buy', type: 'limit', triggerPrice: D(90), size: { qty: D(1) } },
      quote(100, 100),
      OPEN_RULES,
      ctx
    );
    const order = placed.delta.pendingUpsert[0];
    const state = account({
      balance: placed.delta.account.balance,
      leverage: 10, // e.g. changed by an old client
      symbolLeverage: {},
      pendingOrders: [order],
    });
    const res = editPending(
      state,
      order.id,
      { triggerPrice: D(80), size: { qty: D(1) }, takeProfit: null, stopLoss: null },
      quote(100, 100),
      OPEN_RULES,
      ctx
    );
    expect(res.delta.pendingUpsert[0].leverage).toBe(3);
    expectDec(res.delta.pendingUpsert[0].usdtAmount, D(80).div(3).toString());
  });
});
