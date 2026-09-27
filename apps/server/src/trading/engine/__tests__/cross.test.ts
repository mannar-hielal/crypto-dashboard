/**
 * BP-5 E: cross margin — Bybit's account figures, order acceptance against the available balance
 * (unrealised profit counts, O5), losses beyond a position's margin, funding from the wallet,
 * account liquidation at a 100% MM rate, and the margin-mode switch (O3).
 *
 * Reference: long 0.1 BTC @ 50,000 at 10× (BTCUSDT tier 1: MMR 0.33%, deduction 0) — IM 500,
 * open fee 2.75, fee to close 2.475 held with it.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  MODE_REASON_BALANCE,
  MODE_REASON_LIQUIDATION,
  REJECT_MARGIN_CROSS,
  REJECT_MARGIN_MODE,
  accountLiquidatable,
  adjustMargin,
  applyDelta,
  closePosition,
  liquidateAccount,
  placeMarket,
  placePending,
  settleFunding,
  switchMarginMode,
  type AccountState,
  type EngineContext,
  type InstrumentRules,
  type MarginMode,
} from '../index.js';
import { crossFigures } from '../margin.js';

const D = (v: number | string) => new Decimal(v);
const RULES: InstrumentRules = {
  tickSize: D(0),
  qtyStep: D(0),
  minOrderQty: D(0),
  minNotional: D(0),
};
const flat = (p: number) => ({ last: D(p), bid: D(p), ask: D(p), mark: D(p) });

let seq = 0;
function ctxAt(marks: Record<string, number> = {}): EngineContext {
  const bySymbol = new Map(Object.entries(marks).map(([k, v]) => [k, D(v)]));
  return {
    now: 1_800_000_000_000 + ++seq * 1_000,
    newId: () => `id${++seq}`,
    markPrice: (s) => bySymbol.get(s),
  };
}

function account(mode: MarginMode = 'REGULAR_MARGIN', balance = 10_000): AccountState {
  return {
    balance: D(balance),
    realizedPnl: D(0),
    leverage: 10,
    symbolLeverage: { BTCUSDT: 10, ETHUSDT: 10 },
    symbolFundingAt: {},
    spot: [],
    positions: [],
    pendingOrders: [],
    ...(mode === 'REGULAR_MARGIN' ? { marginMode: mode } : {}),
  };
}

function buy(s: AccountState, symbol: string, qty: string, price: number, ctx = ctxAt()) {
  const res = placeMarket(
    s,
    { symbol, side: 'buy', size: { qty: D(qty) } },
    flat(price),
    RULES,
    ctx
  );
  expect(res.invalid).toBeUndefined();
  return { state: applyDelta(s, res.delta), res };
}

const figures = (s: AccountState, marks: Record<string, number>) =>
  crossFigures(
    { balance: s.balance, positions: s.positions, orders: s.pendingOrders },
    ctxAt(marks)
  );

describe('BP-5 E — cross account figures (Bybit get-wallet-balance)', () => {
  it('values the position at mark: margin balance, IM, MM, rates and available balance', () => {
    const { state } = buy(account(), 'BTCUSDT', '0.1', 50_000);
    // Wallet = 10,000 − 2.75 open fee; the margin is still the account's money
    const f = figures(state, { BTCUSDT: 49_000 });
    expect(f.walletBalance.toString()).toBe('9997.25');
    expect(f.unrealisedPnl.toString()).toBe('-100');
    expect(f.marginBalance.toString()).toBe('9897.25');
    // IM = 0.1 × 49,000 / 10 + fee to close at mark (4,900 × 0.9 × 0.055%)
    expect(f.totalIM.toString()).toBe('492.4255');
    // MM = 4,900 × 0.33% + the same fee to close
    expect(f.totalMM.toString()).toBe('18.5955');
    expect(f.available.toString()).toBe('9404.8245');
    expect(f.mmRate.toFixed(6)).toBe(D('18.5955').div('9897.25').toFixed(6));
  });

  it('a new account state (absent mode) is isolated — the pre-BP-5 behaviour', () => {
    expect(account('ISOLATED_MARGIN').marginMode).toBeUndefined();
  });
});

describe('BP-5 E — order acceptance and losses in cross', () => {
  // 1,000 USDT: a 0.1 BTC long at 10× takes ~505 of it; then BTC rises to 60,000 (+1,000 unrealised)
  const start = (mode: MarginMode) => buy(account(mode, 1_000), 'BTCUSDT', '0.1', 50_000).state;

  it('unrealised profit backs a new order in cross (O5), not in isolated', () => {
    const order = (s: AccountState) =>
      placeMarket(
        s,
        // 2.5 ETH × 2,500 / 10 = 625 of margin — more than the ~495 free balance
        { symbol: 'ETHUSDT', side: 'buy', size: { qty: D('2.5') } },
        flat(2_500),
        RULES,
        ctxAt({ BTCUSDT: 60_000, ETHUSDT: 2_500 })
      );
    const cross = order(start('REGULAR_MARGIN'));
    expect(cross.result).not.toBeNull();
    expect(applyDelta(start('REGULAR_MARGIN'), cross.delta).positions).toHaveLength(2);
    const iso = order(start('ISOLATED_MARGIN'));
    expect(iso.result).toBeNull(); // Not enough funds
  });

  it('a pending order is checked against the available balance in cross too', () => {
    const s = start('REGULAR_MARGIN');
    const res = placePending(
      s,
      {
        symbol: 'ETHUSDT',
        side: 'buy',
        type: 'limit',
        triggerPrice: D(2_400),
        size: { qty: D('2.5') },
      },
      flat(2_500),
      RULES,
      ctxAt({ BTCUSDT: 60_000, ETHUSDT: 2_500 })
    );
    expect(res.result).not.toBeNull();
  });

  it('a loss beyond the position margin comes out of the wallet in cross, not in isolated', () => {
    const close = (mode: MarginMode) => {
      const { state } = buy(account(mode), 'BTCUSDT', '0.1', 50_000);
      // Closed at 40,000 — past the isolated bankruptcy price (45,000): −1,000 on 500 of IM
      const res = closePosition(state, state.positions[0].id, flat(40_000), ctxAt());
      return res.delta.account.balance.minus(state.balance);
    };
    // Isolated: nothing comes back, nothing more is lost
    expect(close('ISOLATED_MARGIN').toString()).toBe('0');
    // Cross: 500 + 2.475 − 1,000 − 2.2 (0.1 × 40,000 × 0.055%)
    expect(close('REGULAR_MARGIN').toString()).toBe('-499.725');
  });

  it('isolated: a close past the bankruptcy price books only what was lost to realized PnL (BP-5 F)', () => {
    const { state } = buy(account('ISOLATED_MARGIN'), 'BTCUSDT', '0.1', 50_000);
    const res = closePosition(state, state.positions[0].id, flat(40_000), ctxAt());
    // IM 500 + fee reserve 2.475 + open fee 2.75 — not the −1,000 price move
    expect(res.delta.account.realizedPnl.toString()).toBe('-505.225');
    expect(res.delta.balanceEvents[0].pnl.toString()).toBe('-502.475');
  });

  it('funding is paid from the wallet in full, never out of a position margin', () => {
    const { state } = buy(account('REGULAR_MARGIN'), 'BTCUSDT', '0.1', 50_000);
    const broke = { ...state, balance: D(0) };
    const res = settleFunding(
      broke,
      {
        symbol: 'BTCUSDT',
        ts: 1_800_000_000_000,
        rate: D('0.01'), // 5,000 × 1% = 50
        mark: D(50_000),
        positions: [{ positionId: state.positions[0].id, side: 'long', qty: D('0.1') }],
      },
      ctxAt()
    );
    expect(res.delta.account.balance.toString()).toBe('-50');
    expect(res.delta.positionsUpsert[0].entryUsdtAmount.toString()).toBe('500');
  });

  it('refuses add / reduce margin in cross (isolated only, as on Bybit)', () => {
    const { state } = buy(account('REGULAR_MARGIN'), 'BTCUSDT', '0.1', 50_000);
    expect(adjustMargin(state, state.positions[0].id, D(100), ctxAt()).invalid).toBe(
      REJECT_MARGIN_CROSS
    );
  });
});

describe('BP-5 E — account liquidation at a 100% MM rate', () => {
  // 600 USDT, long 0.1 BTC at 10×: wallet 597.25. MB = 597.25 + (mark − 50,000) × 0.1
  const small = () => buy(account('REGULAR_MARGIN', 600), 'BTCUSDT', '0.1', 50_000).state;

  it('is liquidatable only once the margin balance falls to the maintenance margin', () => {
    const s = small();
    expect(accountLiquidatable(s, ctxAt({ BTCUSDT: 45_000 }))).toBe(false);
    expect(accountLiquidatable(s, ctxAt({ BTCUSDT: 44_100 }))).toBe(true);
    // An isolated account is never liquidated as a whole
    expect(accountLiquidatable({ ...s, marginMode: undefined }, ctxAt({ BTCUSDT: 1 }))).toBe(false);
  });

  it('cancels the orders, closes at the estimated bankruptcy price, and the account ends at 0', () => {
    let s = small();
    const limit = placePending(
      s,
      {
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'limit',
        triggerPrice: D(40_000),
        size: { qty: D('0.001') },
      },
      flat(50_000),
      RULES,
      ctxAt({ BTCUSDT: 50_000 })
    );
    s = applyDelta(s, limit.delta);
    expect(s.pendingOrders).toHaveLength(1);
    const res = liquidateAccount(s, ctxAt({ BTCUSDT: 44_100 }));
    const after = applyDelta(s, res.delta);
    expect(res.sound).toBe('liquidation');
    expect(after.pendingOrders).toEqual([]);
    expect(after.positions).toEqual([]);
    expect(res.delta.trades[0]).toMatchObject({ execType: 'BustTrade' });
    expect(res.delta.orders.some((o) => o.createType === 'CreateByLiq')).toBe(true);
    // The whole margin balance is gone (within rounding), never below 0
    expect(after.balance.gte(0)).toBe(true);
    expect(after.balance.lt('0.01')).toBe(true);
    expect(res.delta.journal.some((j) => j.text.includes('(cross)'))).toBe(true);
  });

  it('liquidates in Bybit contract order — BTCUSDT before ETHUSDT', () => {
    let s = account('REGULAR_MARGIN', 1_200);
    s = buy(s, 'ETHUSDT', '2', 2_500).state;
    s = buy(s, 'BTCUSDT', '0.1', 50_000).state;
    const res = liquidateAccount(s, ctxAt({ BTCUSDT: 40_000, ETHUSDT: 2_000 }));
    // Trades are newest first: BTC went first
    expect(res.delta.trades.map((t) => t.symbol).reverse()).toEqual(['BTCUSDT', 'ETHUSDT']);
  });

  it('is a no-op while the MM rate is below 100%', () => {
    const res = liquidateAccount(small(), ctxAt({ BTCUSDT: 49_000 }));
    expect(res.result).toBeNull();
    expect(res.delta.trades).toEqual([]);
  });
});

describe('BP-5 E — margin-mode switch (Bybit set-margin-mode, O3)', () => {
  it('isolated → cross is allowed with an open position and returns added margin to the wallet', () => {
    let s = buy(account('ISOLATED_MARGIN'), 'BTCUSDT', '0.1', 50_000).state;
    s = applyDelta(s, adjustMargin(s, s.positions[0].id, D(300), ctxAt()).delta);
    const res = switchMarginMode(s, 'REGULAR_MARGIN', ctxAt({ BTCUSDT: 50_000 }));
    expect(res.invalid).toBeUndefined();
    const after = applyDelta(s, res.delta);
    expect(after.marginMode).toBe('REGULAR_MARGIN');
    expect(after.positions[0].extraMargin?.toString()).toBe('0');
    expect(after.balance.minus(s.balance).toString()).toBe('300');
    expect(res.delta.journal[0].text).toBe(
      'Margin mode changed: Isolated → Cross (applies to the whole account)'
    );
  });

  it('cross → isolated is refused, listing every reason, when isolated margin could not hold', () => {
    // A cross account that lost more than its free balance, with the mark past the isolated liq
    const s = {
      ...buy(account('REGULAR_MARGIN'), 'BTCUSDT', '0.1', 50_000).state,
      balance: D(-10),
    };
    const res = switchMarginMode(s, 'ISOLATED_MARGIN', ctxAt({ BTCUSDT: 45_000 }));
    expect(res.invalid).toBe(
      REJECT_MARGIN_MODE([MODE_REASON_BALANCE, MODE_REASON_LIQUIDATION('BTCUSDT')])
    );
    expect(res.result).toBe('REGULAR_MARGIN');
  });

  it('the same mode is a no-op', () => {
    const s = account('REGULAR_MARGIN');
    const res = switchMarginMode(s, 'REGULAR_MARGIN', ctxAt());
    expect(res.delta.journal).toEqual([]);
    expect(res.result).toBe('REGULAR_MARGIN');
  });
});

describe('BP-5 F — funding for a position closed before its settlement', () => {
  it('is charged from the wallet and handed to that close (Closed P&L)', () => {
    const s = account('ISOLATED_MARGIN');
    const res = settleFunding(
      s,
      {
        symbol: 'BTCUSDT',
        ts: 1_800_000_000_000,
        rate: D('0.0001'),
        mark: D(50_000),
        positions: [
          { positionId: 'gone', side: 'long', qty: D('0.1'), openedAt: 1_700_000_000_000 },
        ],
      },
      ctxAt()
    );
    expect(res.delta.account.balance.toString()).toBe('9999.5');
    expect(res.delta.closedTradeFunding).toEqual([
      { symbol: 'BTCUSDT', openedAt: 1_700_000_000_000, ts: 1_800_000_000_000, funding: D('0.5') },
    ]);
  });
});
