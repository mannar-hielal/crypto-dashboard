/**
 * BP-3: isolated-margin liquidation on the mark price, settled at the bankruptcy price
 * (docs/APP_LOG.md Bybit Parity BP-3, Bybit's UTA isolated-mode formulas in bybitSpec.ts).
 *
 * Reference position: long 0.1 BTC @ 50,000 at 10× — IM 500, fee to close 2.475,
 * BTCUSDT tier 1 (MMR 0.33%): liquidation (5,000 − 500) / (0.1 × 0.9967) ≈ 45,148.99,
 * bankruptcy 50,000 − 500 / 0.1 = 45,000.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  evaluateCandle,
  evaluateTick,
  executeTrigger,
  liquidatePosition,
  placeMarket,
  placePending,
  type AccountState,
  type InstrumentRules,
} from '../index.js';
import { riskOf } from '../margin.js';
import { fallbackRiskTiers } from '../../bybitSpec.js';

const D = (v: number | string) => new Decimal(v);
const ctx = { now: 1_800_000_000_000, newId: () => 'id1' };
const quote = (bid: number, ask: number) => ({ last: D(ask), bid: D(bid), ask: D(ask) });
const BTC_RULES: InstrumentRules = {
  tickSize: D('0.1'),
  qtyStep: D('0.001'),
  minOrderQty: D('0.001'),
  minNotional: D(5),
};
const TIERS = fallbackRiskTiers('BTCUSDT');

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

function openAt10x(side: 'buy' | 'sell', extra: { takeProfit?: Decimal; stopLoss?: Decimal } = {}) {
  const res = placeMarket(
    account(),
    { symbol: 'BTCUSDT', side, size: { qty: D('0.1') }, ...extra },
    quote(50_000, 50_000),
    BTC_RULES,
    ctx
  );
  return account({ balance: res.delta.account.balance, positions: res.delta.positionsUpsert });
}

describe('liquidation and bankruptcy prices', () => {
  it('long 10×: liquidation 45,148.99… rounded up to the tick = 45,149.0, bankruptcy 45,000', () => {
    const risk = riskOf(openAt10x('buy').positions[0], TIERS);
    // Bybit rounds a long's liquidation price up to the tick (0.1 for BTCUSDT): the safe side
    expect(risk.liqPrice.toFixed(2)).toBe('45149.00');
    expect(risk.bustPrice.toString()).toBe('45000');
    expect(risk.positionIM.toString()).toBe('502.475');
    // 5,000 × 0.33% + 2.475
    expect(risk.positionMM.toString()).toBe('18.975');
  });

  it('short 10×: liquidation 54,819.09… rounded down to the tick = 54,819.0, bankruptcy 55,000', () => {
    const risk = riskOf(openAt10x('sell').positions[0], TIERS);
    // (5,000 + 500) / (0.1 × 1.0033) = 54,819.0970…; a short's is rounded down (the safe side)
    expect(risk.liqPrice.toFixed(2)).toBe('54819.00');
    expect(risk.bustPrice.toString()).toBe('55000');
  });

  it('a 1× long can not be liquidated (liquidation price 0)', () => {
    const res = placeMarket(
      account({ symbolLeverage: { BTCUSDT: 1 } }),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') } },
      quote(50_000, 50_000),
      BTC_RULES,
      ctx
    );
    expect(riskOf(res.delta.positionsUpsert[0], TIERS).liqPrice.toString()).toBe('0');
  });
});

describe('evaluateTick — liquidation on the mark price', () => {
  const state = openAt10x('buy', { stopLoss: D(44_000) });
  const pos = state.positions[0];
  const at = (last: number, mark: number) =>
    evaluateTick('linear', 'BTCUSDT', D(last), state.positions, [], {
      price: D(mark),
      tiers: TIERS,
    });

  it('liquidates when the mark reaches the liquidation price', () => {
    expect(at(45_300, 45_140)).toEqual([
      { kind: 'liquidation', positionId: pos.id, price: D(45_140) },
    ]);
  });

  it('does not liquidate on the last price — only the mark counts', () => {
    expect(at(45_000, 45_200)).toEqual([]);
  });

  it('liquidation wins over a TP / SL on the same tick (nothing left to close)', () => {
    const triggers = at(43_900, 45_100); // last also crossed the stop-loss
    expect(triggers).toHaveLength(1);
    expect(triggers[0].kind).toBe('liquidation');
  });

  it('with no mark (spot, or a stale feed) only TP / SL are checked', () => {
    const triggers = evaluateTick('linear', 'BTCUSDT', D(43_900), state.positions, []);
    expect(triggers).toEqual([
      { kind: 'exit', positionId: pos.id, leg: 'stop-loss', price: D(43_900) },
    ]);
  });
});

describe('evaluateCandle — backfilled liquidation (mark-price candles)', () => {
  const candle = (start: number, high: number, low: number) => ({
    start,
    high: D(high),
    low: D(low),
  });

  it('liquidates when the mark candle reached the liquidation price', () => {
    const state = openAt10x('buy');
    const [t] = evaluateCandle(
      'linear',
      'BTCUSDT',
      candle(ctx.now, 46_000, 45_500),
      state.positions,
      [],
      { candle: candle(ctx.now, 45_900, 45_100), tiers: TIERS }
    );
    expect(t).toMatchObject({ kind: 'liquidation', positionId: state.positions[0].id });
  });

  it('a stop-loss in the same minute wins: it sits before the liquidation price', () => {
    const state = openAt10x('buy', { stopLoss: D(46_000) });
    const triggers = evaluateCandle(
      'linear',
      'BTCUSDT',
      candle(ctx.now, 46_500, 45_000),
      state.positions,
      [],
      { candle: candle(ctx.now, 46_400, 45_050), tiers: TIERS }
    );
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({ kind: 'exit', leg: 'stop-loss' });
  });

  it('should liquidate, not stop out, when the stop-loss sits beyond the liquidation price', () => {
    // Long 10× @ 50,000: liquidation ≈ 45,149. A stop-loss at 44,000 is accepted (as on Bybit),
    // but a continuous path reaches the liquidation price first — the stop never fills
    const state = openAt10x('buy', { stopLoss: D(44_000) });
    const triggers = evaluateCandle(
      'linear',
      'BTCUSDT',
      candle(ctx.now, 46_000, 43_900),
      state.positions,
      [],
      { candle: candle(ctx.now, 45_950, 43_950), tiers: TIERS }
    );
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({ kind: 'liquidation' });
  });

  it('ignores a mark candle that started before the position opened', () => {
    const state = openAt10x('buy');
    const triggers = evaluateCandle(
      'linear',
      'BTCUSDT',
      candle(ctx.now - 60_000, 46_000, 45_500),
      state.positions,
      [],
      { candle: candle(ctx.now - 60_000, 45_900, 45_000), tiers: TIERS }
    );
    expect(triggers).toEqual([]);
  });
});

describe('liquidatePosition — the whole position margin is lost', () => {
  const state = openAt10x('buy', { takeProfit: D(60_000), stopLoss: D(40_000) });
  const pos = state.positions[0];
  const res = liquidatePosition(state, pos.id, D(45_140), ctx);

  it('closes at the bankruptcy price and returns nothing to the wallet', () => {
    expect(res.delta.positionsRemove).toEqual([pos.id]);
    expect(res.delta.account.balance.toString()).toBe(state.balance.toString());
    expect(res.delta.trades[0]).toMatchObject({ execType: 'BustTrade' });
    expect(res.delta.trades[0].exitPrice.toString()).toBe('45000');
    expect(res.delta.trades[0].pnl.toString()).toBe('-500');
  });

  it('realized PnL = −(IM + fee to close) − open fee', () => {
    // −500 − 2.475 − 2.75
    expect(res.delta.account.realizedPnl.toString()).toBe('-505.225');
  });

  it('writes a CreateByLiq close order, cancels the TP / SL legs and plays the liquidation sound', () => {
    expect(res.delta.orders[0]).toMatchObject({
      createType: 'CreateByLiq',
      type: 'market',
      side: 'sell',
      status: 'filled',
    });
    expect(res.delta.orders.filter((o) => o.status === 'cancelled').map((o) => o.type)).toEqual([
      'take-profit',
      'stop-loss',
    ]);
    expect(res.sound).toBe('liquidation');
    expect(res.delta.journal[0].text).toBe(
      'Liquidated LONG BTCUSDT — mark price $45140.00 reached the liquidation price $45149.00; ' +
        'closed at the bankruptcy price $45000.00'
    );
    expect(res.delta.balanceEvents[0].action).toBe(
      'Liquidation of long position for BTCUSDT at bankruptcy price 45000.0000 for 0.100000 units'
    );
  });

  it('cancels the symbol’s active orders first and refunds them; other symbols are untouched', () => {
    const btcOrder = placePending(
      state,
      {
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'stop',
        triggerPrice: D(60_000),
        size: { qty: D('0.01') },
      },
      undefined,
      BTC_RULES,
      ctx
    ).delta.pendingUpsert[0];
    const ethOrder = { ...btcOrder, id: 'eth', symbol: 'ETHUSDT' };
    const withOrders = account({
      balance: state.balance.minus(btcOrder.reserved).minus(ethOrder.reserved),
      positions: state.positions,
      pendingOrders: [btcOrder, ethOrder],
    });
    const out = liquidatePosition(withOrders, pos.id, D(45_140), ctx);
    expect(out.delta.pendingRemove).toEqual([btcOrder.id]);
    expect(out.delta.account.balance.toString()).toBe(
      withOrders.balance.plus(btcOrder.reserved).toString()
    );
  });

  it('executeTrigger runs a liquidation trigger', () => {
    const out = executeTrigger(
      state,
      { kind: 'liquidation', positionId: pos.id, price: D(45_140) },
      undefined,
      ctx
    );
    expect(out.sound).toBe('liquidation');
  });

  it('a missing position is a no-op', () => {
    expect(liquidatePosition(state, 'nope', D(1), ctx).result).toBeNull();
  });
});
