/**
 * BP-4: funding settlement, as Bybit (UTA, isolated margin) — docs/BYBIT_PARITY_PLAN.md BP-4.
 *
 * fee = size × mark × rate; a long pays a positive rate, a short receives it. Paid from the
 * balance, any shortfall from the position's margin. Booked in realized PnL at settlement; a close
 * carries its share (Closed P&L), never charged twice. A timestamp is settled once per symbol.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  closePosition,
  placeMarket,
  settleFunding,
  type AccountState,
  type FundingSpec,
  type InstrumentRules,
} from '../index.js';
import { riskOf } from '../margin.js';
import { fallbackRiskTiers } from '../../bybitSpec.js';

const D = (v: number | string) => new Decimal(v);
const ctx = { now: 1_800_000_000_000, newId: () => 'id1' };
const TS = 1_800_000_000_000 + 60_000;
const quote = (bid: number, ask: number) => ({ last: D(ask), bid: D(bid), ask: D(ask) });
const RULES: InstrumentRules = {
  tickSize: D('0.1'),
  qtyStep: D('0.001'),
  minOrderQty: D('0.001'),
  minNotional: D(5),
};

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

/** Account holding 0.1 BTC at 10× opened at 50,000 (IM 500), `side` long or short. */
function holding(side: 'buy' | 'sell') {
  const res = placeMarket(
    account(),
    { symbol: 'BTCUSDT', side, size: { qty: D('0.1') } },
    quote(50_000, 50_000),
    RULES,
    ctx
  );
  return account({
    balance: res.delta.account.balance,
    realizedPnl: res.delta.account.realizedPnl,
    positions: res.delta.positionsUpsert,
  });
}

function spec(state: AccountState, rate: string, mark = 51_000): FundingSpec {
  return {
    symbol: 'BTCUSDT',
    ts: TS,
    rate: D(rate),
    mark: D(mark),
    positions: state.positions.map((p) => ({ positionId: p.id, side: p.side, qty: p.quantity })),
  };
}

describe('settleFunding — who pays', () => {
  it('a long pays a positive rate: 0.1 × 51,000 × 0.01% = 0.51', () => {
    const state = holding('buy');
    const res = settleFunding(state, spec(state, '0.0001'), ctx);
    expect(res.delta.account.balance.toString()).toBe(state.balance.minus('0.51').toString());
    expect(res.delta.account.realizedPnl.toString()).toBe(
      state.realizedPnl.minus('0.51').toString()
    );
    expect(res.delta.fundings[0]).toMatchObject({ side: 'long', time: TS });
    expect(res.delta.fundings[0].fee.toString()).toBe('0.51'); // + = paid (Bybit execFee)
    expect(res.delta.positionsUpsert[0].cumFunding?.toString()).toBe('0.51');
    expect(res.result).toBe(1);
  });

  it('a short receives a positive rate', () => {
    const state = holding('sell');
    const res = settleFunding(state, spec(state, '0.0001'), ctx);
    expect(res.delta.account.balance.toString()).toBe(state.balance.plus('0.51').toString());
    expect(res.delta.fundings[0].fee.toString()).toBe('-0.51'); // − = received
    expect(res.delta.journal[0].text).toBe(
      'Funding received +$0.5100 · SHORT BTCUSDT 0.100000 @ mark $51000.00, rate 0.0100%'
    );
  });

  it('a negative rate reverses it: the long receives', () => {
    const state = holding('buy');
    const res = settleFunding(state, spec(state, '-0.0002'), ctx);
    expect(res.delta.account.balance.toString()).toBe(state.balance.plus('1.02').toString());
  });

  it('writes a Balance History row and a journal line for each payment', () => {
    const state = holding('buy');
    const res = settleFunding(state, spec(state, '0.0001'), ctx);
    expect(res.delta.balanceEvents[0].action).toBe(
      'Funding fee for long BTCUSDT (rate 0.0100%, mark 51000.0000, 0.100000 units)'
    );
    expect(res.delta.balanceEvents[0].pnl.toString()).toBe('-0.51');
    expect(res.delta.journal[0].text).toBe(
      'Funding fee −$0.5100 · LONG BTCUSDT 0.100000 @ mark $51000.00, rate 0.0100%'
    );
    expect(res.sound).toBeUndefined(); // Bybit settles silently
  });
});

describe('settleFunding — once per timestamp', () => {
  it('a timestamp already settled for the symbol is a no-op (restart, retry, second machine)', () => {
    const state = holding('buy');
    const first = settleFunding(state, spec(state, '0.0001'), ctx);
    expect(first.delta.account.symbolFundingAt).toEqual({ BTCUSDT: TS });
    const again = settleFunding(
      { ...state, symbolFundingAt: first.delta.account.symbolFundingAt },
      spec(state, '0.0001'),
      ctx
    );
    expect(again.result).toBe(0);
    expect(again.delta.fundings).toHaveLength(0);
    expect(again.delta.account.balance.toString()).toBe(state.balance.toString());
  });
});

describe('settleFunding — where the money comes from', () => {
  it('a shortfall comes out of the position margin, which moves the liquidation price closer', () => {
    const state = { ...holding('buy'), balance: D('0.2') };
    const res = settleFunding(state, spec(state, '0.0001'), ctx);
    const pos = res.delta.positionsUpsert[0];
    // 0.20 from the balance, 0.31 from IM 500
    expect(res.delta.account.balance.toString()).toBe('0');
    expect(pos.entryUsdtAmount.toString()).toBe('499.69');
    const tiers = fallbackRiskTiers('BTCUSDT');
    expect(riskOf(pos, tiers).liqPrice.gt(riskOf(state.positions[0], tiers).liqPrice)).toBe(true);
  });

  it('a position closed since the timestamp still pays, from the balance (it was held then)', () => {
    const state = holding('buy');
    const snap = spec(state, '0.0001');
    const closed = closePosition(state, state.positions[0].id, quote(51_000, 51_000), ctx);
    const after = account({
      balance: closed.delta.account.balance,
      realizedPnl: closed.delta.account.realizedPnl,
    });
    const res = settleFunding(after, snap, ctx);
    expect(res.delta.account.balance.toString()).toBe(after.balance.minus('0.51').toString());
    expect(res.delta.fundings).toHaveLength(1);
  });

  it('never charges more than the balance and the margin hold', () => {
    const state = account({ balance: D('0.1') }); // position already closed, 0.1 USDT left
    const res = settleFunding(
      state,
      {
        ...spec(holding('buy'), '0.0001'),
        positions: [{ positionId: 'gone', side: 'long', qty: D('0.1') }],
      },
      ctx
    );
    expect(res.delta.account.balance.toString()).toBe('0');
    expect(res.delta.fundings[0].fee.toString()).toBe('0.1');
    expect(res.delta.account.realizedPnl.toString()).toBe('-0.1');
  });
});

describe('funding and Closed P&L', () => {
  it('a close carries the funding share; realized PnL is not charged again', () => {
    const state = holding('buy');
    const funded = settleFunding(state, spec(state, '0.0001'), ctx);
    const after = account({
      balance: funded.delta.account.balance,
      realizedPnl: funded.delta.account.realizedPnl,
      positions: funded.delta.positionsUpsert,
    });
    const closed = closePosition(after, after.positions[0].id, quote(51_000, 51_000), ctx);
    expect(closed.delta.trades[0].funding?.toString()).toBe('0.51');
    // realized moves by the close only (pnl 100 − close fee 2.805 − open fee 2.75)
    expect(closed.delta.account.realizedPnl.minus(after.realizedPnl).toString()).toBe('94.445');
  });

  it('a same-side add keeps the position’s funding so far', () => {
    const state = holding('buy');
    const funded = settleFunding(state, spec(state, '0.0001'), ctx);
    const added = placeMarket(
      account({
        balance: funded.delta.account.balance,
        positions: funded.delta.positionsUpsert,
      }),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') } },
      quote(52_000, 52_000),
      RULES,
      ctx
    );
    expect(added.delta.positionsUpsert[0].cumFunding?.toString()).toBe('0.51');
  });
});
