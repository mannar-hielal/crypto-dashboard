/**
 * BP-5 C: the risk-limit cap (Bybit 110090) and partial liquidation stepping down the tiers (O7).
 *
 * A small tier table (mmDeduction follows Bybit's rule: previous deduction + previous limit × the
 * MMR step), so tier changes happen at paper-trading sizes:
 *
 *   tier 1 ≤ 10,000  MMR 1%  ded 0      max 50×
 *   tier 2 ≤ 20,000  MMR 2%  ded 100    max 25×
 *   tier 3 ≤ 40,000  MMR 5%  ded 700    max 10×
 *   tier 4 ≤ 80,000  MMR 10% ded 2,700  max 5×
 *
 * Reference: long 0.7 BTC @ 50,000 at 10× — value 35,000 (tier 3), IM 3,500, liq ≈ 46,315.79,
 * bust 45,000.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  REJECT_RISK_LIMIT,
  applyDelta,
  evaluateCandle,
  liquidatePosition,
  placeMarket,
  placePending,
  setSymbolLeverage,
  type AccountState,
  type EngineContext,
  type InstrumentRules,
} from '../index.js';
import { riskOf } from '../margin.js';
import type { RiskTier } from '../../bybitSpec.js';

const D = (v: number | string) => new Decimal(v);
const tier = (limit: number, mmr: string, ded: number, maxLev: number): RiskTier => ({
  riskLimitValue: D(limit),
  mmr: D(mmr),
  mmDeduction: D(ded),
  imr: D(1).div(maxLev),
  maxLeverage: D(maxLev),
});
const TIERS = [
  tier(10_000, '0.01', 0, 50),
  tier(20_000, '0.02', 100, 25),
  tier(40_000, '0.05', 700, 10),
  tier(80_000, '0.1', 2_700, 5),
];
const RULES: InstrumentRules = {
  tickSize: D('0.1'),
  qtyStep: D('0.001'),
  minOrderQty: D('0.001'),
  minNotional: D(5),
};
const quote = (p: number) => ({ last: D(p), bid: D(p), ask: D(p), mark: D(p) });

let clock = 1_800_000_000_000;
let seq = 0;
const ctx = (): EngineContext => {
  clock += 1_000;
  return { now: clock, newId: () => `id${++seq}`, riskTiers: () => TIERS };
};

function account(leverage = 10): AccountState {
  return {
    balance: D(10_000),
    realizedPnl: D(0),
    leverage,
    symbolLeverage: { BTCUSDT: leverage },
    symbolFundingAt: {},
    spot: [],
    positions: [],
    pendingOrders: [],
  };
}

function open(qty: string, leverage = 10): AccountState {
  const s = account(leverage);
  const res = placeMarket(
    s,
    { symbol: 'BTCUSDT', side: 'buy', size: { qty: D(qty) } },
    quote(50_000),
    RULES,
    ctx()
  );
  expect(res.invalid).toBeUndefined();
  return applyDelta(s, res.delta);
}

describe('BP-5 C — risk-limit cap (110090)', () => {
  it('refuses an order that takes the value past the cap of the leverage, naming the leverage to go down to', () => {
    // 0.9 BTC × 50,000 = 45,000 > the 10× cap (40,000); tier 4 (≤ 80,000) allows up to 5×
    const res = placeMarket(
      account(),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.9') } },
      quote(50_000),
      RULES,
      ctx()
    );
    expect(res.invalid).toBe(REJECT_RISK_LIMIT(5));
    expect(res.invalid).toBe(
      'The position may exceed the max limit. Please adjust your leverage to 5 or below.'
    );
  });

  it('counts resting orders on the same side, but not reduce-only ones', () => {
    let s = open('0.5'); // 25,000
    const stop = (qty: string, reduceOnly = false) =>
      placePending(
        s,
        {
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'stop',
          triggerPrice: D(52_000),
          size: { qty: D(qty) },
          ...(reduceOnly ? { reduceOnly } : {}),
        },
        undefined,
        RULES,
        ctx()
      );
    // 25,000 + 0.3 × 52,000 = 40,600 > 40,000
    expect(stop('0.3').invalid).toBe(REJECT_RISK_LIMIT(5));
    const ok = stop('0.25'); // 38,000
    expect(ok.invalid).toBeUndefined();
    s = applyDelta(s, ok.delta);
    expect(s.pendingOrders).toHaveLength(1);
  });

  it('refuses raising the leverage past what the open value allows', () => {
    const s = open('0.9', 5); // 45,000 at 5×: tier 4
    const res = setSymbolLeverage(s, 'BTCUSDT', 10, ctx(), D(50_000));
    expect(res.invalid).toBe(REJECT_RISK_LIMIT(5));
  });
});

describe('BP-5 C — partial liquidation steps down the tiers (O7)', () => {
  it('reduces a tier-3 position to the tier-2 limit and stops when the mark no longer reaches the new liquidation price', () => {
    const s = open('0.7');
    const before = riskOf(s.positions[0], TIERS);
    expect(before.liqPrice.toFixed(2)).toBe('46315.80'); // rounded up to the tick
    const res = liquidatePosition(s, s.positions[0].id, D(46_300), ctx());
    const after = applyDelta(s, res.delta);
    // 0.3 closed at the bankruptcy price: 0.4 × 50,000 = 20,000 is the tier-2 limit
    expect(after.positions[0].quantity.toString()).toBe('0.4');
    expect(after.positions[0].entryUsdtAmount.toString()).toBe('2000');
    expect(riskOf(after.positions[0], TIERS).liqPrice.toFixed(2)).toBe('45663.30'); // rounded up to the tick;
    expect(res.delta.trades).toHaveLength(1);
    expect(res.delta.trades[0]).toMatchObject({ execType: 'BustTrade' });
    expect(res.delta.trades[0].quantity.toString()).toBe('0.3');
    expect(res.delta.trades[0].exitPrice.toString()).toBe('45000');
    // The part's margin is lost; nothing comes back to the wallet
    expect(after.balance.eq(s.balance)).toBe(true);
    expect(res.result?.toString()).toBe('-1500');
    expect(res.delta.journal[0].text).toMatch(/^Partially liquidated LONG BTCUSDT .* tier 2$/);
  });

  it('steps through every tier the mark reaches, then closes in full in the lowest tier', () => {
    const s = open('0.7');
    const res = liquidatePosition(s, s.positions[0].id, D(45_400), ctx());
    const after = applyDelta(s, res.delta);
    expect(after.positions).toEqual([]);
    // 0.3 (tier 3 → 2), 0.2 (tier 2 → 1), then the last 0.2 in full
    expect(res.delta.trades.map((t) => t.quantity.toString()).sort()).toEqual([
      '0.2',
      '0.2',
      '0.3',
    ]);
    expect(res.delta.trades.every((t) => t.execType === 'BustTrade')).toBe(true);
    // The whole IM (3,500) is lost, as a full liquidation of the original position would lose it
    expect(res.result?.toString()).toBe('-3500');
    expect(after.balance.eq(s.balance)).toBe(true);
  });

  it('a lowest-tier position still closes in full (unchanged from BP-3)', () => {
    const s = open('0.1'); // 5,000: tier 1
    const res = liquidatePosition(s, s.positions[0].id, D(40_000), ctx());
    expect(res.delta.trades).toHaveLength(1);
    expect(applyDelta(s, res.delta).positions).toEqual([]);
  });

  it('the backfill carries the minute worst mark, so one candle can take several steps', () => {
    const s = open('0.7');
    const start = s.positions[0].openedAt + 60_000;
    const last = { start, high: D(50_000), low: D(46_000) };
    const mark = { start, high: D(50_000), low: D(45_400) };
    const [t] = evaluateCandle('linear', 'BTCUSDT', last, s.positions, [], {
      candle: mark,
      tiers: TIERS,
    });
    expect(t).toMatchObject({ kind: 'liquidation' });
    expect(t.kind === 'liquidation' && t.worstMark?.toString()).toBe('45400');
  });
});
