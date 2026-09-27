/**
 * Bybit order rules added in BYBIT_PARITY_PLAN BP-5 B: reduce-only / close-on-trigger orders and
 * the TP / SL side check.
 *
 * Reduce-only: the order may only shrink the opposite USDT Perpetual position. It needs one to be
 * placed, reserves no margin (a close's fee comes out of the position), carries no TP / SL, and is
 * capped at the position's size. When the position shrinks below the reduce-only quantity resting
 * on it, the orders furthest from the market are trimmed first, then cancelled (Bybit). Close-on-
 * trigger implies reduce-only; on Bybit it may also cancel other orders to free margin for the
 * close, which a close here never needs.
 *
 * TP / SL side (owner decision O9 — follow Bybit): a long's take-profit must be above the base
 * price and its stop-loss below it; a short's the reverse. The base price is the order price for a
 * limit / stop order, and the current price of the leg's trigger source for a market order or a
 * position. A stop-loss beyond the liquidation price is accepted (the client warns).
 *
 * Risk-limit cap (BP-5 C): an order or a leverage change may not take the symbol's effective
 * position value past the cap of its leverage (Bybit 110090).
 */

import type { Decimal } from '@prisma/client/runtime/client';
import { positionCap, type RiskTier } from '../bybitSpec.js';
import { Draft, ZERO } from './draft.js';
import { fmtPrice, pendingSideLabel, pendingTypeLabel } from './format.js';
import { systemEntry } from './journal.js';
import { priceFor, type PriceSet } from './triggers.js';
import type {
  AccountState,
  EngineContext,
  ExitLeg,
  OrderSide,
  PendingOrder,
  Position,
  PositionSide,
  TriggerBy,
} from './types.js';

// Bybit retMsg texts (codes in comments)
/** 110017 — a reduce-only order with no position to reduce */
export const REJECT_REDUCE_ONLY_NO_POSITION =
  'current position is zero, cannot fix reduce-only order qty';
/** 110017 — a reduce-only order on the position's own side would increase it */
export const REJECT_REDUCE_ONLY_SIDE = 'Reduce-only rule not satisfied';
export const REJECT_REDUCE_ONLY_TPSL = 'TP/SL is not supported for a reduce-only order';
export const REJECT_EXIT_NO_PRICE = 'Waiting for live price…';

// ─── Reduce-only ───────────────────────────────────────────────────────────────

/** The position a reduce-only order on `symbol` / `side` would reduce, or why it can't be placed. */
export function reduceOnlyTarget(
  state: Pick<AccountState, 'positions'>,
  symbol: string,
  side: OrderSide
): { pos: Position } | { invalid: string } {
  const pos = state.positions.find((p) => p.category === 'linear' && p.symbol === symbol);
  if (!pos) return { invalid: REJECT_REDUCE_ONLY_NO_POSITION };
  if ((pos.side === 'long') === (side === 'buy')) return { invalid: REJECT_REDUCE_ONLY_SIDE };
  return { pos };
}

export const isReduceOnly = (o: { reduceOnly?: boolean; closeOnTrigger?: boolean }) =>
  !!(o.reduceOnly || o.closeOnTrigger);

/** The history row of a reduce-only order cancelled by the system (no refund: it reserved none). */
function cancelledRow(order: PendingOrder, now: number) {
  return {
    id: `o-cancel-ro-${order.id}-${now}`,
    category: 'linear' as const,
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    qty: order.qty,
    ...(order.type === 'limit'
      ? { limitPrice: order.triggerPrice }
      : { stopPrice: order.triggerPrice }),
    status: 'cancelled' as const,
    commission: ZERO,
    placingTime: order.placedAt,
    closingTime: now,
    reduceOnly: true,
    ...(order.closeOnTrigger ? { closeOnTrigger: true } : {}),
  };
}

/** Cancel a reduce-only order that has nothing left to reduce. */
export function cancelReduceOnlyInto(
  d: Draft,
  order: PendingOrder,
  ctx: EngineContext,
  why = 'no position left to reduce'
): void {
  const now = ctx.now;
  d.prependOrders(cancelledRow(order, now));
  d.prependJournal(
    systemEntry(
      `j-cancel-ro-${order.id}-${now}`,
      now,
      `Cancelled reduce-only ${pendingTypeLabel(order.type)} ${pendingSideLabel(order.side)} ` +
        `${order.symbol} @ $${fmtPrice(order.triggerPrice)} — ${why}`
    )
  );
  d.balance = d.balance.plus(order.reserved); // 0 — kept for symmetry with every cancel
  d.removePending(order.id);
}

/**
 * Keep the reduce-only orders on `symbol` within what the position can absorb. The orders nearest
 * to `ref` (the current price) keep their size; the furthest are trimmed, then cancelled. With no
 * position — or one on the order's own side — they are all cancelled.
 */
export function trimReduceOnly(d: Draft, symbol: string, ref: Decimal, ctx: EngineContext): void {
  const orders = d.pending.filter(
    (o) => o.category === 'linear' && o.symbol === symbol && isReduceOnly(o)
  );
  if (!orders.length) return;
  const pos = d.positions.find((p) => p.category === 'linear' && p.symbol === symbol);
  const closing: OrderSide | null = pos ? (pos.side === 'long' ? 'sell' : 'buy') : null;
  let room = pos ? pos.quantity : ZERO;
  const byDistance = [...orders].sort(
    (a, b) =>
      a.triggerPrice.minus(ref).abs().comparedTo(b.triggerPrice.minus(ref).abs()) ||
      a.placedAt - b.placedAt
  );
  for (const order of byDistance) {
    const keep = order.side === closing ? (order.qty.lt(room) ? order.qty : room) : ZERO;
    if (keep.gte(order.qty)) {
      room = room.minus(order.qty);
      continue;
    }
    if (keep.lte(0)) {
      cancelReduceOnlyInto(
        d,
        order,
        ctx,
        pos && order.side === closing
          ? 'the position is smaller than the reduce-only orders on it'
          : 'no position left to reduce'
      );
      continue;
    }
    d.setPending({ ...order, qty: keep });
    d.prependJournal(
      systemEntry(
        `j-trim-ro-${order.id}-${ctx.now}`,
        ctx.now,
        `Reduce-only ${pendingTypeLabel(order.type)} ${pendingSideLabel(order.side)} ${order.symbol} ` +
          `@ $${fmtPrice(order.triggerPrice)} trimmed to the position size (qty: ${keep.toFixed(6)})`
      )
    );
    room = ZERO;
  }
}

// ─── TP / SL side (O9) ─────────────────────────────────────────────────────────

/** Bybit's message for a TP / SL on the wrong side of the base price (retCode 10001). */
export function exitSideMessage(
  leg: ExitLeg,
  level: Decimal,
  side: PositionSide,
  base: Decimal,
  by: TriggerBy
): string {
  const name = leg === 'take-profit' ? 'TakeProfit' : 'StopLoss';
  const bybitSide = side === 'long' ? 'Buy' : 'Sell';
  const above = (side === 'long') === (leg === 'take-profit');
  return (
    `${name}:${level.toString()} set for ${bybitSide} position should be ` +
    `${above ? 'higher' : 'lower'} than base_price:${base.toString()}??${by}`
  );
}

/** A leg to check: its level, and what it triggers on. */
export interface ExitCheck {
  leg: ExitLeg;
  level: Decimal;
  by: TriggerBy;
}

/**
 * The first TP / SL on the wrong side of its base price, or null. `base` is either the order's
 * price for every leg (a limit / stop order) or the current prices per source (a market order or a
 * position), read with the leg's trigger source. A source price that isn't known yet refuses the
 * change — never accept a leg that might already be past its level.
 */
export function exitSideProblem(
  side: PositionSide,
  legs: ExitCheck[],
  base: { order: Decimal } | { prices: PriceSet<Decimal | undefined> }
): string | null {
  for (const { leg, level, by } of legs) {
    const ref = 'order' in base ? base.order : priceFor(base.prices, by);
    if (!ref) return REJECT_EXIT_NO_PRICE;
    const above = (side === 'long') === (leg === 'take-profit');
    if (above ? level.lte(ref) : level.gte(ref)) {
      return exitSideMessage(leg, level, side, ref, 'order' in base ? 'LastPrice' : by);
    }
  }
  return null;
}

/** The legs of a new TP / SL pair to check (unset legs are skipped). */
export function exitChecks(
  tp: Decimal | undefined,
  sl: Decimal | undefined,
  tpBy: TriggerBy | undefined,
  slBy: TriggerBy | undefined
): ExitCheck[] {
  const legs: ExitCheck[] = [];
  if (tp) legs.push({ leg: 'take-profit', level: tp, by: tpBy ?? 'LastPrice' });
  if (sl) legs.push({ leg: 'stop-loss', level: sl, by: slBy ?? 'LastPrice' });
  return legs;
}

/** `{ [key]: by }` only when `by` isn't the default LastPrice — the engine's convention. */
export function triggerByOf<K extends string>(
  key: K,
  by: TriggerBy | undefined
): { [P in K]?: TriggerBy } {
  return by && by !== 'LastPrice' ? ({ [key]: by } as { [P in K]?: TriggerBy }) : {};
}

// ─── Risk-limit cap (BP-5 C) ───────────────────────────────────────────────────

/** Bybit 110090 — the effective position value would pass the cap for the leverage */
export const REJECT_RISK_LIMIT = (leverage: number | null) =>
  leverage === null
    ? 'The position may exceed the max limit.'
    : `The position may exceed the max limit. Please adjust your leverage to ${leverage} or below.`;

/**
 * Bybit's effective position value for a symbol: max(long position + buy orders, short position +
 * sell orders), valued at `price` (the mark) when known, else at each item's own price. Reduce-only
 * and close-on-trigger orders don't count. `add` is an order being placed.
 */
export function effectiveValue(
  state: Pick<AccountState, 'positions' | 'pendingOrders'>,
  symbol: string,
  price?: Decimal,
  add?: { side: OrderSide; qty: Decimal; price: Decimal }
): Decimal {
  let long = ZERO;
  let short = ZERO;
  for (const p of state.positions) {
    if (p.category !== 'linear' || p.symbol !== symbol) continue;
    const v = p.quantity.times(price ?? p.entryPrice);
    if (p.side === 'long') long = long.plus(v);
    else short = short.plus(v);
  }
  const orders = state.pendingOrders.filter(
    (o) => o.category === 'linear' && o.symbol === symbol && !isReduceOnly(o)
  );
  for (const o of [...orders, ...(add ? [{ ...add, triggerPrice: add.price }] : [])]) {
    const v = o.qty.times(price ?? o.triggerPrice);
    if (o.side === 'buy') long = long.plus(v);
    else short = short.plus(v);
  }
  return long.gt(short) ? long : short;
}

/**
 * Bybit 110090: the effective value must stay within the cap of the symbol's leverage (the highest
 * tier whose max leverage is at least it). The refusal names the highest whole leverage whose cap
 * would hold the value.
 */
export function riskLimitProblem(
  value: Decimal,
  leverage: number,
  tiers: RiskTier[]
): string | null {
  const cap = positionCap(tiers, leverage);
  if (!cap || value.lte(cap)) return null;
  let allowed: number | null = null;
  for (const t of tiers) {
    if (t.riskLimitValue.gte(value)) {
      const lev = Math.floor(t.maxLeverage.toNumber());
      if (lev >= 1 && (allowed === null || lev > allowed)) allowed = lev;
    }
  }
  return REJECT_RISK_LIMIT(allowed === null ? null : Math.min(allowed, leverage));
}
