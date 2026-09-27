/**
 * BP-5 A: add / reduce margin on an isolated position (Bybit POST /v5/position/add-margin).
 *
 * Reference: long 0.1 BTC @ 50,000 at 10× — IM 500, liq ≈ 45,148.99, bust 45,000.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  REJECT_MARGIN_BALANCE,
  REJECT_MARGIN_LIQUIDATION,
  REJECT_MARGIN_MAX_REDUCE,
  REJECT_MARGIN_NO_MARK,
  REJECT_MARGIN_NO_POSITION,
  adjustMargin,
  closePosition,
  placeMarket,
  setSymbolLeverage,
  settleFunding,
  type AccountState,
  type InstrumentRules,
} from '../index.js';
import { riskOf } from '../margin.js';
import { fallbackRiskTiers } from '../../bybitSpec.js';

const D = (v: number | string) => new Decimal(v);
const ctx = { now: 1_800_000_000_000, newId: () => 'id1' };
const quote = (bid: number, ask: number) => ({ last: D(ask), bid: D(bid), ask: D(ask) });
const RULES: InstrumentRules = {
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

function long10x(): AccountState {
  const res = placeMarket(
    account(),
    { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') } },
    quote(50_000, 50_000),
    RULES,
    ctx
  );
  return account({ balance: res.delta.account.balance, positions: res.delta.positionsUpsert });
}

const apply = (state: AccountState, res: ReturnType<typeof adjustMargin>): AccountState => ({
  ...state,
  balance: res.delta.account.balance,
  positions: state.positions.map((p) => res.delta.positionsUpsert.find((u) => u.id === p.id) ?? p),
});

describe('adjustMargin() — add', () => {
  const state = long10x();
  const pos = state.positions[0];
  const res = adjustMargin(state, pos.id, D(1_000), ctx);

  it('moves the amount from the wallet into the position; leverage unchanged', () => {
    expect(res.invalid).toBeUndefined();
    expect(res.delta.account.balance.toString()).toBe(state.balance.minus(1_000).toString());
    const updated = res.delta.positionsUpsert[0];
    expect(updated.extraMargin?.toString()).toBe('1000');
    expect(updated.leverage).toBe(10);
    expect(updated.entryUsdtAmount.toString()).toBe('500');
  });

  it('moves the liquidation price away from the mark', () => {
    const before = riskOf(pos, TIERS).liqPrice;
    const after = riskOf(res.delta.positionsUpsert[0], TIERS).liqPrice;
    expect(after.lt(before)).toBe(true);
    // (5,000 − 500 − 1,000 / 0.99945) / (0.1 × 0.9967) ≈ 35,109
    expect(after.toFixed(0)).toBe('35110');
  });

  it('writes a Balance History row and a journal line', () => {
    expect(res.delta.balanceEvents[0].action).toBe('Add margin for BTCUSDT: +$1000.00');
    expect(res.delta.journal[0].text).toMatch(
      /^Margin added to LONG BTCUSDT: \+\$1000\.00 \(liq\. price \$45148\.99 → \$351/
    );
  });

  it('is refused beyond the available balance (110014)', () => {
    expect(adjustMargin(state, pos.id, state.balance.plus(1), ctx).invalid).toBe(
      REJECT_MARGIN_BALANCE
    );
  });

  it('is refused without a position (110033)', () => {
    expect(adjustMargin(state, 'nope', D(1), ctx).invalid).toBe(REJECT_MARGIN_NO_POSITION);
  });
});

describe('adjustMargin() — reduce', () => {
  const withExtra = apply(
    long10x(),
    adjustMargin(long10x(), long10x().positions[0].id, D(1_000), ctx)
  );
  const pos = withExtra.positions[0];

  it('takes margin added by hand back to the wallet (needs a live mark)', () => {
    expect(adjustMargin(withExtra, pos.id, D(-400), ctx).invalid).toBe(REJECT_MARGIN_NO_MARK);
    const res = adjustMargin(withExtra, pos.id, D(-400), ctx, D(50_000));
    expect(res.delta.positionsUpsert[0].extraMargin?.toString()).toBe('600');
    expect(res.delta.account.balance.toString()).toBe(withExtra.balance.plus(400).toString());
  });

  it('never below the margin added by hand (110078)', () => {
    expect(adjustMargin(withExtra, pos.id, D(-1_000.01), ctx, D(50_000)).invalid).toBe(
      REJECT_MARGIN_MAX_REDUCE
    );
  });

  it('is refused when the mark would be past the new liquidation price (110011)', () => {
    // With 1,000 extra the liq is ≈ 35,110; the mark at 40,000 is past the ≈ 45,149 of none
    expect(adjustMargin(withExtra, pos.id, D(-1_000), ctx, D(40_000)).invalid).toBe(
      REJECT_MARGIN_LIQUIDATION
    );
  });
});

describe('extra margin through the position’s life (Bybit)', () => {
  const withExtra = apply(
    long10x(),
    adjustMargin(long10x(), long10x().positions[0].id, D(1_000), ctx)
  );
  const pos = withExtra.positions[0];

  it('a partial close returns it pro rata', () => {
    const res = placeMarket(
      withExtra,
      { symbol: 'BTCUSDT', side: 'sell', size: { qty: D('0.05') } },
      quote(50_000, 50_000),
      RULES,
      ctx
    );
    expect(res.delta.positionsUpsert[0].extraMargin?.toString()).toBe('500');
  });

  it('a full close returns all of it', () => {
    const noExtra = long10x();
    const a = closePosition(noExtra, noExtra.positions[0].id, quote(50_000, 50_000), ctx);
    const b = closePosition(withExtra, pos.id, quote(50_000, 50_000), ctx);
    const backA = a.delta.account.balance.minus(noExtra.balance);
    const backB = b.delta.account.balance.minus(withExtra.balance);
    expect(backB.minus(backA).toString()).toBe('1000');
  });

  it('a leverage change releases all of it to the wallet', () => {
    const res = setSymbolLeverage(withExtra, 'BTCUSDT', 5, ctx, D(50_000));
    expect(res.invalid).toBeUndefined();
    expect(res.delta.positionsUpsert[0].extraMargin?.toString()).toBe('0');
    // 10× → 5×: IM 500 → 1,000 (+500), fee to close 2.475 → 2.2 (−0.275), extra −1,000 back
    expect(res.delta.account.balance.minus(withExtra.balance).toString()).toBe('500.275');
  });

  it('a funding shortfall takes IM first, then extra margin', () => {
    const broke = { ...withExtra, balance: D(0) };
    const res = settleFunding(
      broke,
      {
        symbol: 'BTCUSDT',
        ts: ctx.now,
        rate: D('0.2'), // 0.1 × 50,000 × 20% = 1,000: IM 500, then 500 of the extra
        mark: D(50_000),
        positions: [{ positionId: pos.id, side: 'long', qty: D('0.1') }],
      },
      ctx
    );
    const after = res.delta.positionsUpsert[0];
    expect(after.entryUsdtAmount.toString()).toBe('0');
    expect(after.extraMargin?.toString()).toBe('500');
  });
});
