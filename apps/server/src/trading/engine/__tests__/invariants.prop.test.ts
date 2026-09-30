/**
 * Engine invariants over random action sequences (T1p, docs/TRADING_TEST_PLAN.md roadmap P4, M7).
 *
 * One generator of engine actions — market / limit / stop orders, cancels, amends, closes, margin
 * changes, leverage, margin mode, funding, spot orders and TP / SL, resets — over two symbols and
 * both markets, with the price on a bounded random walk. Every price move runs the triggers the
 * way TradingService does (liquidations, TP / SL, pending fills, a cross account's liquidation).
 * After every engine result:
 * - wallet conservation against the engine's own records: the money held anywhere (free balance,
 *   position margin, order reserves, spot coins at cost) changes by exactly the trades' gross PnL
 *   minus the fees and funding charged — only a loss the account is spared (bankruptcy, a cross
 *   write-off) may leave it better off, never worse;
 * - every fee is Bybit's maker / taker rate × qty × fill price, and a refused action changes nothing;
 * - nothing goes negative: isolated balance, margin, reserves, spot free / locked;
 * - a reduce-only fill never opens, grows or flips a position;
 * - a cross liquidation leaves no negative balance once nothing is open.
 * Separately: the liquidation price moves toward the mark as leverage rises, and the same sequence
 * replays to the same state.
 *
 * Checked by planting bugs in the engine (2026-09-30): an uncharged close fee, a spot sell fee
 * dropped, funding not taken from the balance, maker fees on taker fills, and reduce-only with its
 * three guards removed each fail the suite.
 *
 * PRs run FC_NUM_RUNS (default 200) with a fixed seed, so the gate is deterministic; the weekly
 * run (engine-depth.yml) sets FC_NUM_RUNS=5000 and a fresh FC_SEED, printed in the test title.
 * A shrunk counterexample becomes a named T1 regression test.
 */

import { Decimal } from '@prisma/client/runtime/client';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fallbackRules, feeRate } from '../../bybitSpec.js';
import {
  accountLiquidatable,
  adjustMargin,
  applyDelta,
  cancelPending,
  cancelSpotPending,
  checkPendingTrigger,
  closePosition,
  editPending,
  editSpotLimit,
  evaluateTick,
  executeTrigger,
  isLiquidatable,
  legHit,
  legTriggerBy,
  liquidateAccount,
  orderTriggerBy,
  placeMarket,
  placePending,
  placeSpotExits,
  placeSpotLimit,
  placeSpotMarket,
  resetAccount,
  setSymbolLeverage,
  settleFunding,
  switchMarginMode,
  updatePositionExits,
  type AccountState,
  type ActionResult,
  type Category,
  type EngineContext,
  type OrderSide,
  type Quote,
} from '../index.js';
import { riskOf, tiersFor } from '../margin.js';
import { PaperHarness } from './harness.js';

const NUM_RUNS = Number(process.env.FC_NUM_RUNS ?? 200);
const SEED = Number(process.env.FC_SEED ?? 20260930);
/** A long nightly run needs more than Vitest's 5 s */
const TIMEOUT = Math.max(30_000, NUM_RUNS * 100);

const ZERO = new Decimal(0);
const SYMBOLS = ['BTCUSDT', 'ETHUSDT'] as const;
type Sym = (typeof SYMBOLS)[number];
const startPrice = (s: Sym) => new Decimal(s === 'BTCUSDT' ? 50_000 : 3_000);
/** Spot sells round proceeds down and buys round the fee up, each to 1e-8 — per action, at most */
const ROUNDING = new Decimal('1e-6');

// ─── Actions ───────────────────────────────────────────────────────────────────

type Action =
  | { kind: 'move'; sym: Sym; pct: number }
  | {
      kind: 'market';
      sym: Sym;
      side: OrderSide;
      margin: number;
      exits: [number, number] | null;
      reduceOnly: boolean;
    }
  | {
      kind: 'pending';
      sym: Sym;
      side: OrderSide;
      type: 'limit' | 'stop';
      pct: number;
      margin: number;
      reduceOnly: boolean;
    }
  | { kind: 'cancel'; pick: number }
  | { kind: 'amend'; pick: number; pct: number; margin: number }
  | { kind: 'close'; pick: number }
  | { kind: 'exits'; pick: number; tp: number | null; sl: number | null }
  | { kind: 'margin'; pick: number; amount: number }
  | { kind: 'leverage'; sym: Sym; value: number }
  | { kind: 'mode'; cross: boolean }
  | { kind: 'funding'; sym: Sym; rate: number }
  | { kind: 'spotMarket'; sym: Sym; side: OrderSide; value: number; exits: boolean }
  | { kind: 'spotLimit'; sym: Sym; side: OrderSide; pct: number; value: number }
  | { kind: 'spotExits'; sym: Sym; share: number; tp: number; sl: number }
  | { kind: 'spotAmend'; pick: number; pct: number; value: number }
  | { kind: 'reset' };

const sym = fc.constantFrom(...SYMBOLS);
const side = fc.constantFrom<OrderSide>('buy', 'sell');
const pick = fc.nat({ max: 1_000 });
/**
 * A fraction in whole basis points: fc.double favours values next to 0 and the bounds, which left
 * most price moves flat and most funding rates at 0 after rounding
 */
const bp = (min: number, max: number) =>
  fc
    .integer({ min: Math.round(min * 10_000), max: Math.round(max * 10_000) })
    .map((n) => n / 10_000);
const pct = bp(-0.05, 0.05);
/** A TP / SL distance from the price */
const gap = bp(0.005, 0.1);
const margin = fc.integer({ min: 5, max: 4_000 });
/** One order in four: most sequences hold no position to reduce, and the engine refuses those */
const reduceOnly = fc.constantFrom(false, false, false, true);

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant('move' as const),
      sym,
      pct: bp(-0.12, 0.12),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant('market' as const),
      sym,
      side,
      margin,
      exits: fc.option(fc.tuple(gap, gap), { nil: null }),
      reduceOnly: reduceOnly,
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('pending' as const),
      sym,
      side,
      type: fc.constantFrom<'limit' | 'stop'>('limit', 'stop'),
      pct,
      margin,
      reduceOnly: reduceOnly,
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('cancel' as const), pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('amend' as const), pick, pct, margin }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('close' as const), pick }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('exits' as const),
      pick,
      tp: fc.option(gap, { nil: null }),
      sl: fc.option(gap, { nil: null }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('margin' as const),
      pick,
      amount: fc.integer({ min: -500, max: 500 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('leverage' as const),
      sym,
      value: fc.integer({ min: 1, max: 10 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('mode' as const), cross: fc.boolean() }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('funding' as const),
      sym,
      rate: bp(-0.003, 0.003),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('spotMarket' as const),
      sym,
      side,
      value: fc.integer({ min: 5, max: 3_000 }),
      exits: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('spotLimit' as const),
      sym,
      side,
      pct,
      value: fc.integer({ min: 5, max: 3_000 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('spotExits' as const),
      sym,
      share: bp(0.1, 1),
      tp: gap,
      sl: gap,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('spotAmend' as const),
      pick,
      pct,
      value: fc.integer({ min: 5, max: 3_000 }),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'reset' as const }) }
);

// size 'max': lengths spread over the whole range (the default keeps sequences to a handful)
const sequenceArb = fc.array(actionArb, { minLength: 1, maxLength: 60, size: 'max' });

// ─── The simulated account ─────────────────────────────────────────────────────

const toTick = (price: Decimal, category: Category, s: Sym) => {
  const tick = fallbackRules(category, s).tickSize;
  return tick.gt(0) ? price.toNearest(tick) : price;
};

/** The account plus its market: one sequence of actions run through the pure engine. */
class Sim {
  // New accounts trade at 10× (BP-5), so random walks reach liquidation prices
  state: AccountState = { ...PaperHarness.freshState(), leverage: 10 };
  readonly prices = new Map<string, Decimal>(SYMBOLS.map((s) => [s, startPrice(s)]));
  private clock = 1_800_000_000_000;
  private seq = 0;

  price(s: string): Decimal {
    const p = this.prices.get(s);
    if (!p) throw new Error(`no price for ${s}`);
    return p;
  }

  get cross() {
    return this.state.marginMode === 'REGULAR_MARGIN';
  }

  ctx(): EngineContext {
    this.clock += 1_000;
    return {
      now: this.clock,
      newId: () => `${this.clock}-${(++this.seq).toString(36)}`,
      markPrice: (s) => this.prices.get(s),
    };
  }

  quote(s: Sym, category: Category): Quote {
    const p = this.price(s);
    const bid = toTick(p.times('0.9999'), category, s);
    const ask = toTick(p.times('1.0001'), category, s);
    return category === 'linear' ? { last: p, bid, ask, mark: p, index: p } : { last: p, bid, ask };
  }

  /** Apply one engine result, checking its money against its own records first. */
  apply<R>(res: ActionResult<R>): R {
    const before = this.state;
    this.state = applyDelta(before, res.delta);
    if (res.invalid) {
      expect(this.state, `a refused action changed the state: ${res.invalid}`).toEqual(before);
    }
    if (!res.delta.reset) this.expectConserved(before, res);
    return res.result;
  }

  /** The symbol's position as { side, qty }, for the reduce-only check */
  positionOf(s: string) {
    const p = this.state.positions.find((x) => x.symbol === s);
    return p ? { side: p.side, qty: p.quantity } : null;
  }

  /** A reduce-only fill may shrink or close the position — never open, grow or flip it. */
  expectReduced(s: string, before: ReturnType<Sim['positionOf']>) {
    const after = this.positionOf(s);
    if (!before) {
      expect(after, `reduce-only opened a ${s} position`).toBeNull();
      return;
    }
    if (after) {
      expect(after.side, `reduce-only flipped the ${s} position`).toBe(before.side);
      expect(after.qty.lte(before.qty), `reduce-only grew the ${s} position`).toBe(true);
    }
  }

  // ─── Triggers: what MatchingEngine + TradingService.runTrigger do on a tick ──────

  tick(s: Sym) {
    for (const category of ['linear', 'spot'] as const) {
      const q = this.quote(s, category);
      const mark =
        category === 'linear'
          ? { price: q.last, tiers: tiersFor({}, s), liquidation: !this.cross }
          : undefined;
      const triggers = evaluateTick(
        category,
        s,
        q.last,
        this.state.positions,
        this.state.pendingOrders,
        mark,
        q.index
      );
      for (const t of triggers) {
        // Re-checked against the current state, as runTrigger does: an earlier trigger may have
        // closed the position or filled the order
        if (t.kind === 'liquidation') {
          const pos = this.state.positions.find((p) => p.id === t.positionId);
          if (!pos || this.cross || !isLiquidatable(pos, q.last, tiersFor({}, s))) continue;
        } else if (t.kind === 'exit') {
          const pos = this.state.positions.find((p) => p.id === t.positionId);
          if (
            !pos ||
            legTriggerBy(pos, t.leg) !== (t.by ?? 'LastPrice') ||
            !legHit(pos, t.leg, t.price)
          ) {
            continue;
          }
        } else if (t.kind === 'fill') {
          const order = this.state.pendingOrders.find((o) => o.id === t.orderId);
          if (
            !order ||
            orderTriggerBy(order) !== (t.by ?? 'LastPrice') ||
            !checkPendingTrigger(order, t.price)
          ) {
            continue;
          }
          const before = order.reduceOnly ? this.positionOf(order.symbol) : undefined;
          this.apply(executeTrigger(this.state, t, q, this.ctx()));
          if (before !== undefined) this.expectReduced(order.symbol, before);
          continue;
        } else {
          continue;
        }
        this.apply(executeTrigger(this.state, t, q, this.ctx()));
      }
    }
    if (this.cross) {
      const ctx = this.ctx();
      if (accountLiquidatable(this.state, ctx)) {
        this.apply(liquidateAccount(this.state, ctx));
        if (this.state.positions.length === 0) {
          expect(this.state.balance.gte(0), 'cross liquidation left a negative balance').toBe(true);
        }
      }
    }
  }

  // ─── One action ─────────────────────────────────────────────────────────────

  run(a: Action) {
    switch (a.kind) {
      case 'move': {
        const next = this.price(a.sym).times(1 + a.pct);
        const floor = startPrice(a.sym).div(20);
        this.prices.set(a.sym, toTick(Decimal.max(floor, next), 'linear', a.sym));
        this.tick(a.sym);
        break;
      }
      case 'market': {
        const p = this.price(a.sym);
        const long = a.side === 'buy';
        const [tpPct, slPct] = a.exits ?? [0, 0];
        const before = a.reduceOnly ? this.positionOf(a.sym) : undefined;
        this.apply(
          placeMarket(
            this.state,
            {
              symbol: a.sym,
              side: a.side,
              size: { margin: new Decimal(a.margin) },
              ...(a.exits && !a.reduceOnly
                ? {
                    takeProfit: toTick(p.times(long ? 1 + tpPct : 1 - tpPct), 'linear', a.sym),
                    stopLoss: toTick(p.times(long ? 1 - slPct : 1 + slPct), 'linear', a.sym),
                  }
                : {}),
              reduceOnly: a.reduceOnly,
            },
            this.quote(a.sym, 'linear'),
            fallbackRules('linear', a.sym),
            this.ctx()
          )
        );
        if (before !== undefined) this.expectReduced(a.sym, before);
        break;
      }
      case 'pending':
        this.apply(
          placePending(
            this.state,
            {
              symbol: a.sym,
              side: a.side,
              type: a.type,
              triggerPrice: toTick(this.price(a.sym).times(1 + a.pct), 'linear', a.sym),
              size: { margin: new Decimal(a.margin) },
              reduceOnly: a.reduceOnly,
            },
            this.quote(a.sym, 'linear'),
            fallbackRules('linear', a.sym),
            this.ctx()
          )
        );
        break;
      case 'cancel': {
        const order = this.pickOf(this.state.pendingOrders, a.pick);
        if (!order) break;
        this.apply(
          order.category === 'spot'
            ? cancelSpotPending(this.state, order.id, this.ctx())
            : cancelPending(this.state, order.id, this.ctx())
        );
        break;
      }
      case 'amend': {
        const order = this.pickOf(
          this.state.pendingOrders.filter((o) => o.category === 'linear'),
          a.pick
        );
        if (!order) break;
        const s = order.symbol as Sym;
        this.apply(
          editPending(
            this.state,
            order.id,
            {
              triggerPrice: toTick(this.price(s).times(1 + a.pct), 'linear', s),
              size: { margin: new Decimal(a.margin) },
              takeProfit: null,
              stopLoss: null,
            },
            this.quote(s, 'linear'),
            fallbackRules('linear', s),
            this.ctx()
          )
        );
        break;
      }
      case 'close': {
        const pos = this.pickOf(this.state.positions, a.pick);
        if (!pos) break;
        this.apply(
          closePosition(this.state, pos.id, this.quote(pos.symbol as Sym, 'linear'), this.ctx())
        );
        break;
      }
      case 'exits': {
        const pos = this.pickOf(this.state.positions, a.pick);
        if (!pos) break;
        const s = pos.symbol as Sym;
        const p = this.price(s);
        const long = pos.side === 'long';
        this.apply(
          updatePositionExits(
            this.state,
            pos.id,
            a.tp === null ? null : toTick(p.times(long ? 1 + a.tp : 1 - a.tp), 'linear', s),
            a.sl === null ? null : toTick(p.times(long ? 1 - a.sl : 1 + a.sl), 'linear', s),
            this.ctx()
          )
        );
        break;
      }
      case 'margin': {
        const pos = this.pickOf(this.state.positions, a.pick);
        if (!pos) break;
        this.apply(
          adjustMargin(
            this.state,
            pos.id,
            new Decimal(a.amount),
            this.ctx(),
            this.price(pos.symbol)
          )
        );
        break;
      }
      case 'leverage':
        this.apply(setSymbolLeverage(this.state, a.sym, a.value, this.ctx(), this.price(a.sym)));
        break;
      case 'mode':
        this.apply(
          switchMarginMode(this.state, a.cross ? 'REGULAR_MARGIN' : 'ISOLATED_MARGIN', this.ctx())
        );
        break;
      case 'funding': {
        const ctx = this.ctx();
        this.apply(
          settleFunding(
            this.state,
            {
              symbol: a.sym,
              ts: ctx.now,
              rate: new Decimal(a.rate).toDecimalPlaces(8),
              mark: this.price(a.sym),
              positions: this.state.positions
                .filter((p) => p.symbol === a.sym)
                .map((p) => ({
                  positionId: p.id,
                  side: p.side,
                  qty: p.quantity,
                  openedAt: p.openedAt,
                })),
            },
            ctx
          )
        );
        break;
      }
      case 'spotMarket': {
        const q = this.quote(a.sym, 'spot');
        const buy = a.side === 'buy';
        this.apply(
          placeSpotMarket(
            this.state,
            {
              symbol: a.sym,
              side: a.side,
              size: { value: new Decimal(a.value) },
              ...(buy && a.exits
                ? {
                    takeProfit: toTick(q.ask.times('1.05'), 'spot', a.sym),
                    stopLoss: toTick(q.bid.times('0.95'), 'spot', a.sym),
                  }
                : {}),
            },
            q,
            fallbackRules('spot', a.sym),
            this.ctx()
          )
        );
        break;
      }
      case 'spotLimit':
        this.apply(
          placeSpotLimit(
            this.state,
            {
              symbol: a.sym,
              side: a.side,
              triggerPrice: toTick(this.price(a.sym).times(1 + a.pct), 'spot', a.sym),
              size: { value: new Decimal(a.value) },
            },
            this.quote(a.sym, 'spot'),
            fallbackRules('spot', a.sym),
            this.ctx()
          )
        );
        break;
      case 'spotExits': {
        const coin = a.sym.replace(/USDT$/, '');
        const h = this.state.spot.find((x) => x.coin === coin);
        if (!h || h.free.lte(0)) break;
        const rules = fallbackRules('spot', a.sym);
        const qty = h.free.times(a.share);
        const q = this.quote(a.sym, 'spot');
        this.apply(
          placeSpotExits(
            this.state,
            {
              symbol: a.sym,
              qty: rules.qtyStep.gt(0) ? qty.toNearest(rules.qtyStep, Decimal.ROUND_DOWN) : qty,
              takeProfit: toTick(q.ask.times(1 + a.tp), 'spot', a.sym),
              stopLoss: toTick(q.bid.times(1 - a.sl), 'spot', a.sym),
            },
            q,
            rules,
            this.ctx()
          )
        );
        break;
      }
      case 'spotAmend': {
        const order = this.pickOf(
          this.state.pendingOrders.filter((o) => o.category === 'spot' && o.type === 'limit'),
          a.pick
        );
        if (!order) break;
        const s = order.symbol as Sym;
        this.apply(
          editSpotLimit(
            this.state,
            order.id,
            {
              triggerPrice: toTick(this.price(s).times(1 + a.pct), 'spot', s),
              size: { value: new Decimal(a.value) },
              takeProfit: null,
              stopLoss: null,
            },
            this.quote(s, 'spot'),
            fallbackRules('spot', s),
            this.ctx()
          )
        );
        break;
      }
      case 'reset':
        this.apply(resetAccount(this.state));
        break;
    }
    this.checkInvariants(a);
  }

  private pickOf<T>(list: T[], n: number): T | undefined {
    return list.length ? list[n % list.length] : undefined;
  }

  // ─── Invariants ─────────────────────────────────────────────────────────────

  /**
   * Every USDT the account holds, wherever it sits: the free balance, each position's margin
   * (IM, margin added by hand, the close-fee reserve), each USDT Perpetual order's and spot buy's
   * reserve, and spot coins at their average cost (the buy fee, taken in coins, is in that cost).
   */
  static held(s: AccountState): Decimal {
    let total = s.balance;
    for (const p of s.positions) {
      total = total
        .plus(p.entryUsdtAmount)
        .plus(p.extraMargin ?? ZERO)
        .plus(p.closeFeeReserve);
    }
    for (const o of s.pendingOrders) {
      if (o.category === 'linear' || (o.side === 'buy' && o.type === 'limit')) {
        total = total.plus(o.reserved);
      }
    }
    for (const h of s.spot) total = total.plus(h.free.plus(h.locked).times(h.avgCost));
    return total;
  }

  /**
   * Wallet conservation, checked against the engine's own records rather than its realized PnL
   * (which it books from the same numbers, so a missing fee would cancel out): what the account
   * holds changes by exactly the trades' gross PnL, minus their close fees, minus the open fees
   * charged, minus the funding paid.
   *
   * The only exception is a loss the account is spared: an isolated close past the bankruptcy
   * price (a close never returns less than 0), a liquidation at the bankruptcy price, or a cross
   * account's shortfall written off once nothing is open (Bybit's insurance fund). Those may leave
   * the account better off than its records, never worse.
   */
  expectConserved(before: AccountState, res: ActionResult<unknown>) {
    const { delta } = res;
    const openFees = this.state.positions
      .reduce((sum, p) => sum.plus(p.entryFee), ZERO)
      .minus(before.positions.reduce((sum, p) => sum.plus(p.entryFee), ZERO))
      .plus(delta.trades.reduce((sum, t) => sum.plus(t.openFee ?? ZERO), ZERO));
    const recorded = delta.trades
      .reduce((sum, t) => sum.plus(t.pnl).minus(t.exitCommission), ZERO)
      .minus(openFees)
      .minus(delta.fundings.reduce((sum, f) => sum.plus(f.fee), ZERO));
    const diff = Sim.held(this.state).minus(Sim.held(before)).minus(recorded);
    const spared =
      delta.trades.some((t) => t.execType === 'BustTrade') ||
      (before.marginMode !== 'REGULAR_MARGIN' &&
        delta.trades.some((t) => {
          const pos = before.positions.find((p) => p.symbol === t.symbol && p.side === t.side);
          if (!pos || t.category !== 'linear') return false;
          const bust = riskOf(pos, tiersFor({}, t.symbol)).bustPrice;
          return t.side === 'long' ? t.exitPrice.lte(bust) : t.exitPrice.gte(bust);
        })) ||
      (before.marginMode === 'REGULAR_MARGIN' && this.state.positions.length === 0);
    const detail = `held ${Sim.held(before).toString()} → ${Sim.held(this.state).toString()}, records ${recorded.toString()}`;
    if (spared) {
      expect(diff.gte(ROUNDING.neg()), `the account paid more than its records: ${detail}`).toBe(
        true
      );
    } else {
      expect(diff.abs().lte(ROUNDING), `wallet not conserved: ${detail}`).toBe(true);
    }
    // Every fee is Bybit's VIP-0 rate for the order's liquidity (a market order is always a taker)
    // times qty × fill price; a spot buy pays its fee in coins
    for (const o of delta.orders) {
      if (o.status !== 'filled' || !o.feeRate || !o.fillPrice) continue;
      if (o.type === 'market')
        expect(o.isMaker, `market order ${o.id} filled as maker`).toBe(false);
      expect(
        o.feeRate.eq(feeRate(o.category, o.isMaker ? 'maker' : 'taker')),
        `order ${o.id} charged ${o.feeRate.toString()}, not the ${o.isMaker ? 'maker' : 'taker'} rate`
      ).toBe(true);
      // A liquidation charges the close-fee reserve set aside at open (Bybit's fee to close, priced
      // at entry × (1 ∓ 1/leverage)); with margin added by hand its fill price, the bankruptcy
      // price, sits further out, so qty × price × rate overstates it by added margin × rate.
      // Open (M7 finding, 2026-09-30; docs/APP_LOG.md Bybit Parity → Open items): which of the two
      // Bybit's execFee is.
      if (o.feeAsset !== 'USDT' || o.createType === 'CreateByLiq') continue;
      const expected = o.qty.times(o.fillPrice).times(o.feeRate);
      expect(
        o.commission.minus(expected).abs().lte(ROUNDING),
        `order ${o.id} charged ${o.commission.toString()}, its rate says ${expected.toString()}`
      ).toBe(true);
    }
  }

  checkInvariants(a: Action) {
    const s = this.state;
    const where = `after ${JSON.stringify(a)}`;

    if (!this.cross) expect(s.balance.gte(0), `negative isolated balance ${where}`).toBe(true);
    for (const p of s.positions) {
      expect(p.quantity.gt(0), `empty position ${where}`).toBe(true);
      expect(p.entryUsdtAmount.gte(0), `negative IM ${where}`).toBe(true);
      expect((p.extraMargin ?? ZERO).gte(0), `negative added margin ${where}`).toBe(true);
      expect(p.closeFeeReserve.gte(0), `negative close-fee reserve ${where}`).toBe(true);
      expect(p.entryFee.gte(0), `negative open fee ${where}`).toBe(true);
    }
    // One-way mode: at most one position per symbol
    const symbols = s.positions.map((p) => p.symbol);
    expect(new Set(symbols).size, `two positions on one symbol ${where}`).toBe(symbols.length);
    for (const o of s.pendingOrders) {
      expect(o.reserved.gte(0), `negative order reserve ${where}`).toBe(true);
      expect(o.qty.gt(0), `empty order ${where}`).toBe(true);
    }
    for (const h of s.spot) {
      expect(h.free.gte(0), `negative free ${h.coin} ${where}`).toBe(true);
      expect(h.locked.gte(0), `negative locked ${h.coin} ${where}`).toBe(true);
      const locks = s.pendingOrders
        .filter((o) => o.category === 'spot' && o.symbol === `${h.coin}USDT` && o.side === 'sell')
        .reduce((sum, o) => (o.ocoGroup ? sum : sum.plus(o.reserved)), ZERO);
      expect(locks.lte(h.locked), `sell orders lock more ${h.coin} than is locked ${where}`).toBe(
        true
      );
    }
  }
}

/** The account's state as comparable text (Decimals print as strings) */
const snapshot = (sim: Sim) => JSON.stringify({ state: sim.state, prices: [...sim.prices] });

// ─── Properties ────────────────────────────────────────────────────────────────

const params = { numRuns: NUM_RUNS, seed: SEED };

describe(`engine invariants (fast-check, ${NUM_RUNS} runs, seed ${SEED})`, () => {
  it(
    '[18.11] [14.2.7] should conserve the wallet and keep every balance, margin and reserve non-negative over any action sequence',
    () => {
      fc.assert(
        fc.property(sequenceArb, (actions) => {
          const sim = new Sim();
          for (const a of actions) sim.run(a);
        }),
        params
      );
    },
    TIMEOUT
  );

  it(
    '[18.13] should replay the same action sequence to the same state',
    () => {
      fc.assert(
        fc.property(sequenceArb, (actions) => {
          const first = new Sim();
          const second = new Sim();
          for (const a of actions) first.run(a);
          for (const a of actions) second.run(a);
          expect(snapshot(second)).toBe(snapshot(first));
        }),
        { ...params, numRuns: Math.max(20, Math.floor(NUM_RUNS / 4)) }
      );
    },
    TIMEOUT
  );

  it(
    '[18.12] should move the liquidation price toward the mark as leverage rises',
    () => {
      fc.assert(
        fc.property(
          sym,
          side,
          fc.integer({ min: 1, max: 9 }),
          fc.integer({ min: 20, max: 4_000 }),
          (s, orderSide, leverage, value) => {
            const liqAt = (lev: number) => {
              const state = { ...PaperHarness.freshState(), symbolLeverage: { [s]: lev } };
              const p = startPrice(s);
              const res = placeMarket(
                state,
                { symbol: s, side: orderSide, size: { value: new Decimal(value) } },
                { last: p, bid: p, ask: p, mark: p, index: p },
                fallbackRules('linear', s),
                { now: 1, newId: () => 'x' }
              );
              const pos = applyDelta(state, res.delta).positions[0];
              return pos ? riskOf(pos, tiersFor({}, s)).liqPrice : undefined;
            };
            const low = liqAt(leverage);
            const high = liqAt(leverage + 1);
            fc.pre(low !== undefined && high !== undefined);
            const mark = startPrice(s);
            if (orderSide === 'buy') {
              expect(high!.gte(low!)).toBe(true);
              expect(high!.lte(mark)).toBe(true);
            } else {
              expect(high!.lte(low!)).toBe(true);
              expect(high!.gte(mark)).toBe(true);
            }
          }
        ),
        params
      );
    },
    TIMEOUT
  );
});
