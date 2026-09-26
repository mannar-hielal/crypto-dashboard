/**
 * Paper-trading actions — pure port of the browser engine (apps/client/src/store/paperStore.ts)
 * for BYBIT_PARITY_PLAN BP-1. Same maths, same record ids, same journal and balance-history text.
 *
 * Deliberate changes vs the browser (agreed 2026-09-26):
 * - S1: a triggered pending order that can't fill is recorded as REJECTED in order history,
 *   instead of vanishing after its reserve was refunded.
 * - S2: a pending order fills with the leverage it was placed with (stored on the order),
 *   not whatever the account leverage is at fill time.
 * - The fill record reuses the pending order's id and type (limit/stop), which is how the
 *   server already showed fills after a reload; the browser briefly showed it as "market".
 *
 * Every action takes the current AccountState and returns a Delta. Nothing here reads a clock,
 * a price feed or the database.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { fmtPrice, pendingSideLabel, pendingTypeLabel } from './format.js';
import { pendingEditEntries, positionExitEditEntries, systemEntry } from './journal.js';
import {
  COMMISSION_RATE,
  MAX_LEVERAGE,
  REJECT_FILL_FAILED,
  REJECT_NOT_ENOUGH_FUNDS,
  STARTING_BALANCE,
  type AccountState,
  type ActionResult,
  type BalanceEvent,
  type ClosedTrade,
  type Delta,
  type EngineContext,
  type ExitLeg,
  type HistoricalOrder,
  type JournalEntry,
  type OrderSide,
  type PendingOrder,
  type PendingType,
  type Position,
} from './types.js';

const R = new Decimal(COMMISSION_RATE);
const ZERO = new Decimal(0);
const FULL_CLOSE_EPSILON = new Decimal('1e-10');

function opposite(side: OrderSide): OrderSide {
  return side === 'buy' ? 'sell' : 'buy';
}

function closingSide(pos: Position): OrderSide {
  return pos.side === 'long' ? 'sell' : 'buy';
}

/**
 * 🔐 Leverage as the money maths may use it: an integer in [1, MAX_LEVERAGE]. Every write path
 * already clamps; re-clamping where a fill is sized means a bad stored value (manual DB fix,
 * a future import) can never size a position.
 */
function clampLeverage(value: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? Math.round(value) : 1, 1), MAX_LEVERAGE);
}

function positive(v: Decimal | null | undefined): Decimal | undefined {
  return v && v.gt(0) ? v : undefined;
}

// ─── Draft: a mutable working copy that records what changed ──────────────────

/**
 * Mirrors the browser engine's sequence of zustand `set()` calls: each step reads the balance
 * the previous step left behind (the netting loop depends on that). List records are
 * prepended, exactly as the browser did, so `delta` lists come out newest-first.
 */
class Draft {
  balance: Decimal;
  realizedPnl: Decimal;
  leverage: number;
  positions: Position[];
  pending: PendingOrder[];
  readonly orders: HistoricalOrder[] = [];
  readonly trades: ClosedTrade[] = [];
  readonly balanceEvents: BalanceEvent[] = [];
  readonly journal: JournalEntry[] = [];
  readonly journalEdits: { id: string; text: string }[] = [];
  private readonly touchedPositions = new Set<string>();
  private readonly touchedPending = new Set<string>();
  private readonly initialPositionIds: Set<string>;
  private readonly initialPendingIds: Set<string>;
  reset = false;

  constructor(state: AccountState) {
    this.balance = state.balance;
    this.realizedPnl = state.realizedPnl;
    this.leverage = clampLeverage(state.leverage);
    this.positions = [...state.positions];
    this.pending = [...state.pendingOrders];
    this.initialPositionIds = new Set(state.positions.map((p) => p.id));
    this.initialPendingIds = new Set(state.pendingOrders.map((o) => o.id));
  }

  prependOrders(...rows: HistoricalOrder[]): void {
    this.orders.unshift(...rows);
  }
  prependTrade(row: ClosedTrade): void {
    this.trades.unshift(row);
  }
  prependBalanceEvent(row: BalanceEvent): void {
    this.balanceEvents.unshift(row);
  }
  prependJournal(...rows: JournalEntry[]): void {
    this.journal.unshift(...rows);
  }

  setPosition(pos: Position): void {
    const i = this.positions.findIndex((p) => p.id === pos.id);
    if (i === -1) this.positions.push(pos);
    // i comes from findIndex on the same array — safe, controlled access
    // eslint-disable-next-line security/detect-object-injection
    else this.positions[i] = pos;
    this.touchedPositions.add(pos.id);
  }
  removePosition(id: string): void {
    this.positions = this.positions.filter((p) => p.id !== id);
    this.touchedPositions.add(id);
  }
  setPending(order: PendingOrder): void {
    const i = this.pending.findIndex((o) => o.id === order.id);
    if (i === -1) this.pending.push(order);
    // i comes from findIndex on the same array — safe, controlled access
    // eslint-disable-next-line security/detect-object-injection
    else this.pending[i] = order;
    this.touchedPending.add(order.id);
  }
  removePending(id: string): void {
    this.pending = this.pending.filter((o) => o.id !== id);
    this.touchedPending.add(id);
  }

  toDelta(): Delta {
    const positionsUpsert: Position[] = [];
    const positionsRemove: string[] = [];
    for (const id of this.touchedPositions) {
      const pos = this.positions.find((p) => p.id === id);
      if (pos) positionsUpsert.push(pos);
      else if (this.initialPositionIds.has(id)) positionsRemove.push(id);
    }
    const pendingUpsert: PendingOrder[] = [];
    const pendingRemove: string[] = [];
    for (const id of this.touchedPending) {
      const order = this.pending.find((o) => o.id === id);
      if (order) pendingUpsert.push(order);
      else if (this.initialPendingIds.has(id)) pendingRemove.push(id);
    }
    return {
      account: { balance: this.balance, realizedPnl: this.realizedPnl, leverage: this.leverage },
      positionsUpsert,
      positionsRemove,
      pendingUpsert,
      pendingRemove,
      orders: this.orders,
      trades: this.trades,
      balanceEvents: this.balanceEvents,
      journal: this.journal,
      journalEdits: this.journalEdits,
      ...(this.reset ? { reset: true } : {}),
    };
  }
}

// ─── Market order (paperStore.placeOrder) ──────────────────────────────────────

interface MarketOptions {
  skipJournal?: boolean;
  /** Leverage override — a pending-order fill uses the order's own (S2) */
  leverage?: number;
  /** The pending order this market fill executes, if any */
  fromPending?: PendingOrder;
}

/** Order-history row written when a pending order fills (reuses its id and type). */
function pendingFillRecord(
  order: PendingOrder,
  base: Omit<HistoricalOrder, 'id' | 'type' | 'placingTime'>
): HistoricalOrder {
  return {
    ...base,
    id: `o-${order.id}`,
    type: order.type,
    ...(order.type === 'limit'
      ? { limitPrice: order.triggerPrice }
      : { stopPrice: order.triggerPrice }),
    leverage: order.leverage,
    placingTime: order.placedAt,
  };
}

function placeMarketInto(
  d: Draft,
  symbol: string,
  side: OrderSide,
  price: Decimal,
  usdtAmountIn: Decimal,
  takeProfit: Decimal | undefined,
  stopLoss: Decimal | undefined,
  ctx: EngineContext,
  opts: MarketOptions = {}
): string | null {
  const leverage = clampLeverage(opts.leverage ?? d.leverage);
  const { skipJournal, fromPending } = opts;
  let usdtAmount = usdtAmountIn;
  if (usdtAmount.lte(0) || price.lte(0)) return null;

  // ── Position netting (one-way): an opposite order closes existing positions first ──
  const oppositeSide = side === 'buy' ? 'short' : 'long';
  const existingOpp = d.positions.filter((p) => p.symbol === symbol && p.side === oppositeSide);
  let skipOrderRecord = false;

  if (existingOpp.length > 0) {
    const incomingQty = usdtAmount.times(leverage).div(price);
    let remainingQty = incomingQty;
    const now = ctx.now;

    for (const pos of existingOpp) {
      if (remainingQty.lte(0)) break;

      const closeQty = Decimal.min(remainingQty, pos.quantity);
      const isFullClose = closeQty.gte(pos.quantity.minus(FULL_CLOSE_EPSILON));
      const fraction = closeQty.div(pos.quantity);
      const pnlPartial =
        pos.side === 'long'
          ? price.minus(pos.entryPrice).times(closeQty)
          : pos.entryPrice.minus(price).times(closeQty);
      const exitCommission = closeQty.times(price).times(R);
      const entryCommissionPartial = pos.entryUsdtAmount.times(fraction).times(R);
      const marginPartial = pos.entryUsdtAmount.times(fraction);
      const returnAmt = Decimal.max(0, marginPartial.plus(pnlPartial).minus(exitCommission));
      const closeId = ctx.newId();
      const netPnl = pnlPartial.minus(exitCommission);

      d.prependTrade({
        id: closeId,
        symbol: pos.symbol,
        side: pos.side,
        quantity: closeQty,
        entryPrice: pos.entryPrice,
        exitPrice: price,
        pnl: pnlPartial,
        exitCommission,
        margin: marginPartial,
        openedAt: pos.openedAt,
        closedAt: now,
      });
      if (!skipJournal) {
        const closedSide = pos.side === 'long' ? 'LONG' : 'SHORT';
        d.prependJournal(
          systemEntry(
            `j-close-${closeId}-exec`,
            now,
            `Closed ${closedSide} ${pos.symbol} @ $${fmtPrice(price)}`,
            netPnl
          )
        );
      }
      d.prependBalanceEvent({
        id: `bl-close-${closeId}`,
        time: now,
        balanceBefore: d.balance,
        balanceAfter: d.balance.plus(returnAmt),
        pnl: netPnl,
        action: `Close ${pos.side} position for ${pos.symbol} at price ${price.toFixed(4)} for ${closeQty.toFixed(6)} units`,
      });

      remainingQty = remainingQty.minus(closeQty);
      d.balance = d.balance.plus(returnAmt);
      d.realizedPnl = d.realizedPnl
        .plus(pnlPartial)
        .minus(exitCommission)
        .minus(entryCommissionPartial);
      if (isFullClose) {
        d.removePosition(pos.id);
      } else {
        d.setPosition({
          ...pos,
          quantity: pos.quantity.minus(closeQty),
          entryUsdtAmount: pos.entryUsdtAmount.times(new Decimal(1).minus(fraction)),
        });
      }
    }

    // One order record per user action (the incoming order), TV-style.
    const leftover = Decimal.max(0, remainingQty);
    const remainderCommission = leftover.times(price).times(R);
    const incomingOrderId = `net-${ctx.newId()}`;
    const closedQty = incomingQty.minus(leftover);
    const base = {
      symbol,
      side,
      qty: incomingQty,
      fillPrice: price,
      status: 'filled' as const,
      commission: closedQty.times(price).times(R).plus(remainderCommission),
      closingTime: now,
    };
    d.prependOrders(
      fromPending
        ? pendingFillRecord(fromPending, base)
        : { ...base, id: `o-${incomingOrderId}`, type: 'market', placingTime: now }
    );

    if (remainingQty.lte(FULL_CLOSE_EPSILON)) return incomingOrderId;

    // Flip: open the remainder as a new position; its order record is already written.
    skipOrderRecord = true;
    usdtAmount = remainingQty.times(price).div(leverage);
  }

  // Entry commission is part of the balance check, so a 100%-of-balance order can't go negative.
  if (usdtAmount.plus(usdtAmount.times(R)).gt(d.balance)) {
    const now = ctx.now;
    const base = {
      symbol,
      side,
      qty: price.gt(0) ? usdtAmount.times(leverage).div(price) : ZERO,
      status: 'rejected' as const,
      commission: ZERO,
      margin: usdtAmount,
      closingTime: now,
      rejectionReason: REJECT_NOT_ENOUGH_FUNDS,
    };
    d.prependOrders(
      fromPending && !skipOrderRecord
        ? pendingFillRecord(fromPending, base)
        : { ...base, id: `o-rej-${ctx.newId()}`, type: 'market', placingTime: now }
    );
    return null;
  }

  const quantity = usdtAmount.times(leverage).div(price);
  const id = ctx.newId();
  const commission = usdtAmount.times(R);
  const now = ctx.now;
  const positionSide = side === 'buy' ? 'long' : 'short';
  const tp = positive(takeProfit);
  const sl = positive(stopLoss);

  d.setPosition({
    id,
    symbol,
    side: positionSide,
    quantity,
    entryPrice: price,
    entryUsdtAmount: usdtAmount,
    openedAt: now,
    ...(tp ? { takeProfit: tp } : {}),
    ...(sl ? { stopLoss: sl } : {}),
  });

  if (!skipOrderRecord) {
    const base = {
      symbol,
      side,
      qty: quantity,
      fillPrice: price,
      status: 'filled' as const,
      commission,
      margin: usdtAmount,
      closingTime: now,
    };
    d.prependOrders(
      fromPending
        ? pendingFillRecord(fromPending, base)
        : { ...base, id: `o-${id}`, type: 'market', leverage, placingTime: now }
    );
  }

  d.prependBalanceEvent({
    id: `bl-${id}`,
    time: now,
    balanceBefore: d.balance,
    balanceAfter: d.balance.minus(usdtAmount).minus(commission),
    pnl: ZERO,
    action: `Enter ${positionSide} position for ${symbol} at price ${price.toFixed(4)} for ${quantity.toFixed(6)} units`,
  });
  if (!skipJournal) {
    d.prependJournal(
      systemEntry(
        `j-${id}-open`,
        now,
        `Opened ${positionSide === 'long' ? 'LONG' : 'SHORT'} ${symbol} @ $${fmtPrice(price)}`
      )
    );
  }
  d.balance = d.balance.minus(usdtAmount).minus(commission);
  return id;
}

export interface MarketIntent {
  symbol: string;
  side: OrderSide;
  usdtAmount: Decimal;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
}

/** Market order at `price` (the server's live last price). Result: new position / order id, or null. */
export function placeMarket(
  state: AccountState,
  intent: MarketIntent,
  price: Decimal,
  ctx: EngineContext
): ActionResult<string | null> {
  const d = new Draft(state);
  const id = placeMarketInto(
    d,
    intent.symbol,
    intent.side,
    price,
    intent.usdtAmount,
    intent.takeProfit,
    intent.stopLoss,
    ctx
  );
  return { delta: d.toDelta(), result: id, ...(id ? { sound: 'placed' as const } : {}) };
}

// ─── Close (paperStore.closePosition) ──────────────────────────────────────────

function closePositionInto(
  d: Draft,
  positionId: string,
  exitPrice: Decimal,
  ctx: EngineContext,
  reason?: string,
  closeType?: ExitLeg
): Decimal | null {
  const pos = d.positions.find((p) => p.id === positionId);
  if (!pos) return null;

  const pnl =
    pos.side === 'long'
      ? exitPrice.minus(pos.entryPrice).times(pos.quantity)
      : pos.entryPrice.minus(exitPrice).times(pos.quantity);
  const commission = pos.quantity.times(exitPrice).times(R);
  const entryCommission = pos.entryUsdtAmount.times(R);
  const returnAmount = Decimal.max(0, pos.entryUsdtAmount.plus(pnl).minus(commission));
  const now = ctx.now;
  const closedId = ctx.newId();

  d.prependTrade({
    id: positionId,
    symbol: pos.symbol,
    side: pos.side,
    quantity: pos.quantity,
    entryPrice: pos.entryPrice,
    exitPrice,
    pnl,
    exitCommission: commission,
    margin: pos.entryUsdtAmount,
    openedAt: pos.openedAt,
    closedAt: now,
  });

  const closingOrder: HistoricalOrder = {
    id: `o-close-${closedId}`,
    symbol: pos.symbol,
    side: closingSide(pos),
    type: closeType ?? 'market',
    qty: pos.quantity,
    fillPrice: exitPrice,
    status: 'filled',
    commission,
    placingTime: now,
    closingTime: now,
  };
  const siblingCancels: HistoricalOrder[] = [];
  const cancelExit = (leg: ExitLeg, price: Decimal) => {
    siblingCancels.push({
      id: `o-cancel-${leg}-${positionId}-${now}`,
      symbol: pos.symbol,
      side: closingSide(pos),
      type: leg,
      qty: pos.quantity,
      ...(leg === 'take-profit' ? { limitPrice: price } : { stopPrice: price }),
      status: 'cancelled',
      commission: ZERO,
      placingTime: pos.openedAt,
      closingTime: now,
    });
  };
  if (closeType === 'take-profit') {
    if (pos.stopLoss) cancelExit('stop-loss', pos.stopLoss);
  } else if (closeType === 'stop-loss') {
    if (pos.takeProfit) cancelExit('take-profit', pos.takeProfit);
  } else {
    // Manual close cancels every remaining exit leg.
    if (pos.takeProfit) cancelExit('take-profit', pos.takeProfit);
    if (pos.stopLoss) cancelExit('stop-loss', pos.stopLoss);
  }
  d.prependOrders(closingOrder, ...siblingCancels);

  const netPnl = pnl.minus(commission);
  d.prependBalanceEvent({
    id: `bl-close-${closedId}`,
    time: now,
    balanceBefore: d.balance,
    balanceAfter: d.balance.plus(returnAmount),
    pnl: netPnl,
    action: `Close ${pos.side} position for ${pos.symbol} at price ${exitPrice.toFixed(4)} for ${pos.quantity.toFixed(6)} units`,
  });
  d.prependJournal(
    reason
      ? systemEntry(`j-close-${closedId}-reason`, now, reason, netPnl)
      : systemEntry(
          `j-close-${closedId}-exec`,
          now,
          `Closed ${pos.side === 'long' ? 'LONG' : 'SHORT'} ${pos.symbol} @ $${fmtPrice(exitPrice)}`,
          netPnl
        )
  );

  d.balance = d.balance.plus(returnAmount);
  d.realizedPnl = d.realizedPnl.plus(pnl).minus(commission).minus(entryCommission);
  d.removePosition(positionId);
  return pnl;
}

/**
 * Close a position at `exitPrice` with an optional journal `reason` and close type — the browser's
 * `closePosition(id, price, reason?, closeType?)`. Result: gross PnL, or null if not found.
 */
export function closePositionAs(
  state: AccountState,
  positionId: string,
  exitPrice: Decimal,
  ctx: EngineContext,
  reason?: string,
  closeType?: ExitLeg
): ActionResult<Decimal | null> {
  const d = new Draft(state);
  const pnl = closePositionInto(d, positionId, exitPrice, ctx, reason, closeType);
  return {
    delta: d.toDelta(),
    result: pnl,
    ...(pnl ? { sound: pnl.gte(0) ? ('profit' as const) : ('loss' as const) } : {}),
  };
}

/** Manual close at `exitPrice` (the server's live last price). Result: gross PnL, or null if not found. */
export function closePosition(
  state: AccountState,
  positionId: string,
  exitPrice: Decimal,
  ctx: EngineContext
): ActionResult<Decimal | null> {
  return closePositionAs(state, positionId, exitPrice, ctx);
}

/** TP/SL auto-close (the browser's useTPSLMonitor). */
export function closeOnExit(
  state: AccountState,
  positionId: string,
  leg: ExitLeg,
  closePrice: Decimal,
  ctx: EngineContext
): ActionResult<Decimal | null> {
  const pos = state.positions.find((p) => p.id === positionId);
  if (!pos) return closePositionAs(state, positionId, closePrice, ctx);
  const label = leg === 'take-profit' ? 'Take-Profit' : 'Stop-Loss';
  const reason = `Auto-closed ${pos.side.toUpperCase()} ${pos.symbol} — ${label} hit at $${fmtPrice(closePrice)}`;
  return closePositionAs(state, positionId, closePrice, ctx, reason, leg);
}

// ─── Pending orders (paperStore.placeLimitOrder / placeStopOrder) ──────────────

export interface PendingIntent {
  symbol: string;
  side: OrderSide;
  type: PendingType;
  triggerPrice: Decimal;
  usdtAmount: Decimal;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
}

/** Result: the pending order id, or null (no record is written — as in the browser). */
export function placePending(
  state: AccountState,
  intent: PendingIntent,
  ctx: EngineContext
): ActionResult<string | null> {
  const d = new Draft(state);
  const { symbol, side, type, triggerPrice, usdtAmount } = intent;
  if (usdtAmount.lte(0) || triggerPrice.lte(0)) return { delta: d.toDelta(), result: null };
  const totalCost = usdtAmount.plus(usdtAmount.times(R));
  if (totalCost.gt(d.balance)) return { delta: d.toDelta(), result: null };

  const id = ctx.newId();
  const qty = usdtAmount.times(d.leverage).div(triggerPrice);
  const now = ctx.now;
  const tp = positive(intent.takeProfit);
  const sl = positive(intent.stopLoss);

  d.setPending({
    id,
    symbol,
    side,
    type,
    usdtAmount,
    triggerPrice,
    qty,
    leverage: d.leverage,
    placedAt: now,
    ...(tp ? { takeProfit: tp } : {}),
    ...(sl ? { stopLoss: sl } : {}),
  });
  d.prependJournal(
    systemEntry(
      `j-place-${type}-${id}`,
      now,
      `Placed ${pendingTypeLabel(type)} ${pendingSideLabel(side)} ${symbol} @ $${fmtPrice(triggerPrice)}` +
        ` (qty: ${qty.toFixed(6)}, reserved: $${usdtAmount.toFixed(2)})`
    )
  );
  d.balance = d.balance.minus(totalCost);
  return { delta: d.toDelta(), result: id, sound: 'queued' };
}

/** paperStore.cancelPendingOrder. Result: true if the order existed. */
export function cancelPending(
  state: AccountState,
  orderId: string,
  ctx: EngineContext
): ActionResult<boolean> {
  const d = new Draft(state);
  const order = d.pending.find((o) => o.id === orderId);
  if (!order) return { delta: d.toDelta(), result: false };

  const refund = order.usdtAmount.plus(order.usdtAmount.times(R));
  const now = ctx.now;
  const children: HistoricalOrder[] = [];
  if (order.takeProfit) {
    children.push({
      id: `o-cancel-tp-${orderId}`,
      symbol: order.symbol,
      side: opposite(order.side),
      type: 'take-profit',
      qty: order.qty,
      limitPrice: order.takeProfit,
      status: 'cancelled',
      commission: ZERO,
      placingTime: order.placedAt,
      closingTime: now,
    });
  }
  if (order.stopLoss) {
    children.push({
      id: `o-cancel-sl-${orderId}`,
      symbol: order.symbol,
      side: opposite(order.side),
      type: 'stop-loss',
      qty: order.qty,
      stopPrice: order.stopLoss,
      status: 'cancelled',
      commission: ZERO,
      placingTime: order.placedAt,
      closingTime: now,
    });
  }
  d.prependOrders(
    {
      id: `o-cancel-${orderId}`,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      qty: order.qty,
      ...(order.type === 'limit'
        ? { limitPrice: order.triggerPrice }
        : { stopPrice: order.triggerPrice }),
      status: 'cancelled',
      commission: ZERO,
      placingTime: order.placedAt,
      closingTime: now,
    },
    ...children
  );
  d.prependJournal(
    systemEntry(
      `j-cancel-pending-${orderId}-${now}`,
      now,
      `Cancelled ${pendingTypeLabel(order.type)} ${pendingSideLabel(order.side)} ${order.symbol} @ $${fmtPrice(order.triggerPrice)}` +
        ` (refunded: $${refund.toFixed(2)})`
    )
  );
  d.balance = d.balance.plus(refund);
  d.removePending(orderId);
  return { delta: d.toDelta(), result: true };
}

/** paperStore.cancelExitOrder — remove one TP/SL leg from an open position. */
export function cancelExitLeg(
  state: AccountState,
  positionId: string,
  leg: ExitLeg,
  ctx: EngineContext
): ActionResult<boolean> {
  const d = new Draft(state);
  const pos = d.positions.find((p) => p.id === positionId);
  const target = pos ? (leg === 'take-profit' ? pos.takeProfit : pos.stopLoss) : undefined;
  if (!pos || !target) return { delta: d.toDelta(), result: false };

  const now = ctx.now;
  d.prependOrders({
    id: `o-cancel-${leg}-${positionId}-${now}`,
    symbol: pos.symbol,
    side: closingSide(pos),
    type: leg,
    qty: pos.quantity,
    ...(leg === 'take-profit' ? { limitPrice: target } : { stopPrice: target }),
    status: 'cancelled',
    commission: ZERO,
    placingTime: pos.openedAt,
    closingTime: now,
  });
  d.prependJournal(
    systemEntry(
      `j-cancel-${leg}-${positionId}-${now}`,
      now,
      `${leg === 'take-profit' ? 'Take-Profit' : 'Stop-Loss'} cancelled for ` +
        `${pos.side.toUpperCase()} ${pos.symbol} @ $${fmtPrice(target)}`
    )
  );
  const updated = { ...pos };
  if (leg === 'take-profit') delete updated.takeProfit;
  else delete updated.stopLoss;
  d.setPosition(updated);
  return { delta: d.toDelta(), result: true };
}

/** paperStore.cancelPendingExitLeg — remove one TP/SL leg from a pending order (no refund). */
export function cancelPendingExitLeg(
  state: AccountState,
  orderId: string,
  leg: ExitLeg,
  ctx: EngineContext
): ActionResult<boolean> {
  const d = new Draft(state);
  const order = d.pending.find((o) => o.id === orderId);
  const target = order ? (leg === 'take-profit' ? order.takeProfit : order.stopLoss) : undefined;
  if (!order || !target) return { delta: d.toDelta(), result: false };

  const now = ctx.now;
  d.prependOrders({
    id: `o-cancel-pending-${leg}-${orderId}-${now}`,
    symbol: order.symbol,
    side: opposite(order.side),
    type: leg,
    qty: order.qty,
    ...(leg === 'take-profit' ? { limitPrice: target } : { stopPrice: target }),
    status: 'cancelled',
    commission: ZERO,
    placingTime: order.placedAt,
    closingTime: now,
  });
  d.prependJournal(
    systemEntry(
      `j-cancel-pending-${leg}-${orderId}-${now}`,
      now,
      `${leg === 'take-profit' ? 'Take-Profit' : 'Stop-Loss'} cancelled for ` +
        `pending ${pendingSideLabel(order.side)} ${order.symbol} @ $${fmtPrice(target)}`
    )
  );
  const updated = { ...order };
  if (leg === 'take-profit') delete updated.takeProfit;
  else delete updated.stopLoss;
  d.setPending(updated);
  return { delta: d.toDelta(), result: true };
}

/** paperStore.updatePositionExits — set / change / remove TP and SL. */
export function updatePositionExits(
  state: AccountState,
  positionId: string,
  takeProfit: Decimal | null,
  stopLoss: Decimal | null,
  ctx: EngineContext
): ActionResult<boolean> {
  const d = new Draft(state);
  const pos = d.positions.find((p) => p.id === positionId);
  if (!pos) return { delta: d.toDelta(), result: false };

  const now = ctx.now;
  // Cancel records only when a leg is removed; a price edit is a silent in-place update.
  const rows: HistoricalOrder[] = [];
  if (takeProfit === null && pos.takeProfit) {
    rows.push({
      id: `o-cancel-tp-edit-${positionId}-${now}`,
      symbol: pos.symbol,
      side: closingSide(pos),
      type: 'take-profit',
      qty: pos.quantity,
      limitPrice: pos.takeProfit,
      status: 'cancelled',
      commission: ZERO,
      placingTime: pos.openedAt,
      closingTime: now,
    });
  }
  if (stopLoss === null && pos.stopLoss) {
    rows.push({
      id: `o-cancel-sl-edit-${positionId}-${now}`,
      symbol: pos.symbol,
      side: closingSide(pos),
      type: 'stop-loss',
      qty: pos.quantity,
      stopPrice: pos.stopLoss,
      status: 'cancelled',
      commission: ZERO,
      placingTime: pos.openedAt,
      closingTime: now,
    });
  }
  if (rows.length) d.prependOrders(...rows);
  const entries = positionExitEditEntries(pos, takeProfit, stopLoss, now);
  if (entries.length) d.prependJournal(...entries);

  const updated: Position = { ...pos };
  if (takeProfit !== null) updated.takeProfit = takeProfit;
  else delete updated.takeProfit;
  if (stopLoss !== null) updated.stopLoss = stopLoss;
  else delete updated.stopLoss;
  d.setPosition(updated);
  return { delta: d.toDelta(), result: true };
}

export type EditPendingResult = 'ok' | 'rejected' | 'not-found';

/** paperStore.editPendingOrder */
export function editPending(
  state: AccountState,
  orderId: string,
  newTrigger: Decimal,
  newUsdt: Decimal,
  newTp: Decimal | null,
  newSl: Decimal | null,
  ctx: EngineContext
): ActionResult<EditPendingResult> {
  const d = new Draft(state);
  const order = d.pending.find((o) => o.id === orderId);
  if (!order) return { delta: d.toDelta(), result: 'not-found' };

  const now = ctx.now;
  const oldReserved = order.usdtAmount.plus(order.usdtAmount.times(R));
  const scratchBalance = d.balance.plus(oldReserved);
  const newRequired = newUsdt.plus(newUsdt.times(R));
  const typeLabel = pendingTypeLabel(order.type);
  const sideLabel = pendingSideLabel(order.side);

  if (newRequired.gt(scratchBalance)) {
    // Not enough funds: reject the edit, cancel the order and its exit legs, refund the reserve.
    const children: HistoricalOrder[] = [];
    if (order.takeProfit) {
      children.push({
        id: `o-cancel-tp-rej-${orderId}-${now}`,
        symbol: order.symbol,
        side: opposite(order.side),
        type: 'take-profit',
        qty: order.qty,
        limitPrice: order.takeProfit,
        status: 'cancelled',
        commission: ZERO,
        placingTime: order.placedAt,
        closingTime: now,
      });
    }
    if (order.stopLoss) {
      children.push({
        id: `o-cancel-sl-rej-${orderId}-${now}`,
        symbol: order.symbol,
        side: opposite(order.side),
        type: 'stop-loss',
        qty: order.qty,
        stopPrice: order.stopLoss,
        status: 'cancelled',
        commission: ZERO,
        placingTime: order.placedAt,
        closingTime: now,
      });
    }
    d.prependOrders(
      {
        id: `o-rej-edit-${orderId}-${now}`,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        qty: newTrigger.gt(0) ? newUsdt.times(d.leverage).div(newTrigger) : order.qty,
        ...(order.type === 'limit' ? { limitPrice: newTrigger } : { stopPrice: newTrigger }),
        status: 'rejected',
        commission: ZERO,
        margin: newUsdt,
        placingTime: order.placedAt,
        closingTime: now,
        rejectionReason: REJECT_NOT_ENOUGH_FUNDS,
      },
      ...children
    );
    d.prependJournal(
      systemEntry(
        `j-rej-edit-${orderId}-${now}`,
        now,
        `${typeLabel} ${sideLabel} ${order.symbol} order rejected — Not enough funds ($${newUsdt.toFixed(2)} required, $${scratchBalance.toFixed(2)} available)`
      ),
      ...(order.takeProfit
        ? [
            systemEntry(
              `j-cancel-tp-rej-${orderId}-${now}`,
              now,
              `Take-Profit cancelled for pending ${sideLabel} ${order.symbol} @ $${fmtPrice(order.takeProfit)}`
            ),
          ]
        : []),
      ...(order.stopLoss
        ? [
            systemEntry(
              `j-cancel-sl-rej-${orderId}-${now}`,
              now,
              `Stop-Loss cancelled for pending ${sideLabel} ${order.symbol} @ $${fmtPrice(order.stopLoss)}`
            ),
          ]
        : [])
    );
    d.balance = d.balance.plus(oldReserved);
    d.removePending(orderId);
    return { delta: d.toDelta(), result: 'rejected' };
  }

  const newQty = newTrigger.gt(0) ? newUsdt.times(d.leverage).div(newTrigger) : order.qty;
  const exitCancels: HistoricalOrder[] = [];
  if (newTp === null && order.takeProfit) {
    exitCancels.push({
      id: `o-cancel-tp-edit-pending-${orderId}-${now}`,
      symbol: order.symbol,
      side: opposite(order.side),
      type: 'take-profit',
      qty: order.qty,
      limitPrice: order.takeProfit,
      status: 'cancelled',
      commission: ZERO,
      placingTime: order.placedAt,
      closingTime: now,
    });
  }
  if (newSl === null && order.stopLoss) {
    exitCancels.push({
      id: `o-cancel-sl-edit-pending-${orderId}-${now}`,
      symbol: order.symbol,
      side: opposite(order.side),
      type: 'stop-loss',
      qty: order.qty,
      stopPrice: order.stopLoss,
      status: 'cancelled',
      commission: ZERO,
      placingTime: order.placedAt,
      closingTime: now,
    });
  }
  if (exitCancels.length) d.prependOrders(...exitCancels);
  const entries = pendingEditEntries(order, newTrigger, newUsdt, newQty, newTp, newSl, now);
  if (entries.length) d.prependJournal(...entries);

  const updated: PendingOrder = {
    ...order,
    triggerPrice: newTrigger,
    usdtAmount: newUsdt,
    qty: newQty,
    // qty was recomputed with the current leverage, so the fill must use it too (S2)
    leverage: d.leverage,
  };
  if (newTp !== null) updated.takeProfit = newTp;
  else delete updated.takeProfit;
  if (newSl !== null) updated.stopLoss = newSl;
  else delete updated.stopLoss;
  d.setPending(updated);
  d.balance = d.balance.plus(oldReserved).minus(newRequired);
  return { delta: d.toDelta(), result: 'ok' };
}

// ─── Pending fill (usePendingOrderMonitor + fillPendingOrder + placeOrder) ─────

/**
 * Executes a triggered pending order at `fillPrice`. Its reserve is released and the market
 * fill charges the same margin + commission, so a fill can only fail on the (theoretical) flip
 * edge case; if it does, the order is recorded as rejected, never dropped (S1).
 */
export function fillPending(
  state: AccountState,
  orderId: string,
  fillPrice: Decimal,
  ctx: EngineContext
): ActionResult<string | null> {
  const d = new Draft(state);
  const order = d.pending.find((o) => o.id === orderId);
  if (!order) return { delta: d.toDelta(), result: null };

  d.balance = d.balance.plus(order.usdtAmount.plus(order.usdtAmount.times(R)));
  d.removePending(orderId);

  const posId = placeMarketInto(
    d,
    order.symbol,
    order.side,
    fillPrice,
    order.usdtAmount,
    order.takeProfit,
    order.stopLoss,
    ctx,
    { skipJournal: true, leverage: order.leverage, fromPending: order }
  );

  const typeLabel = order.type === 'limit' ? 'Limit' : 'Stop';
  const sideLabel = pendingSideLabel(order.side);
  const note = (text: string) =>
    d.prependJournal(systemEntry(`j-note-${ctx.newId()}`, ctx.now, text));

  if (posId) {
    note(
      `${typeLabel} order filled — ${sideLabel} ${order.symbol} @ $${fmtPrice(fillPrice)} ` +
        `(trigger: $${fmtPrice(order.triggerPrice)}, qty: ${order.qty.toFixed(6)})`
    );
    if (order.takeProfit) {
      note(
        `Take-Profit order activated — ${sideLabel} ${order.symbol} @ $${fmtPrice(order.takeProfit)}`
      );
    }
    if (order.stopLoss) {
      note(
        `Stop-Loss order activated — ${sideLabel} ${order.symbol} @ $${fmtPrice(order.stopLoss)}`
      );
    }
    return { delta: d.toDelta(), result: posId, sound: 'filled' };
  }
  // S1: the order must always leave a trace in order history. placeMarketInto already wrote a
  // rejected fill record on a funds rejection; on a validation failure nothing was written yet.
  if (!d.orders.some((o) => o.id === `o-${order.id}`)) {
    d.prependOrders(
      pendingFillRecord(order, {
        symbol: order.symbol,
        side: order.side,
        qty: order.qty,
        status: 'rejected',
        commission: ZERO,
        margin: order.usdtAmount,
        closingTime: ctx.now,
        rejectionReason: REJECT_FILL_FAILED,
      })
    );
  }
  note(
    `${typeLabel} order for ${order.symbol} triggered @ $${fmtPrice(fillPrice)} but could not be filled`
  );
  return { delta: d.toDelta(), result: null };
}

// ─── Account & journal ─────────────────────────────────────────────────────────

export function setLeverage(state: AccountState, value: number): ActionResult<number> {
  const d = new Draft(state);
  d.leverage = clampLeverage(value);
  return { delta: d.toDelta(), result: d.leverage };
}

export function addNote(
  state: AccountState,
  text: string,
  ctx: EngineContext
): ActionResult<string> {
  const d = new Draft(state);
  const id = `j-note-${ctx.newId()}`;
  d.prependJournal({ id, time: ctx.now, text, isUserNote: true });
  return { delta: d.toDelta(), result: id };
}

/** The repository applies the edit only to the user's own notes (isUserNote = true). */
export function editNote(
  state: AccountState,
  entryId: string,
  text: string
): ActionResult<boolean> {
  const d = new Draft(state);
  d.journalEdits.push({ id: entryId, text });
  return { delta: d.toDelta(), result: true };
}

export function resetAccount(state: AccountState): ActionResult<boolean> {
  const d = new Draft(state);
  for (const p of state.positions) d.removePosition(p.id);
  for (const o of state.pendingOrders) d.removePending(o.id);
  d.balance = new Decimal(STARTING_BALANCE);
  d.realizedPnl = ZERO;
  d.leverage = 1;
  d.reset = true;
  return { delta: d.toDelta(), result: true };
}

// ─── Trigger execution ─────────────────────────────────────────────────────────

/** Runs a trigger found by evaluateTick / evaluateCandle: a TP/SL close or a pending fill. */
export function executeTrigger(
  state: AccountState,
  trigger:
    | { kind: 'exit'; positionId: string; leg: ExitLeg; price: Decimal }
    | { kind: 'fill'; orderId: string; price: Decimal },
  ctx: EngineContext
): ActionResult<unknown> {
  return trigger.kind === 'exit'
    ? closeOnExit(state, trigger.positionId, trigger.leg, trigger.price, ctx)
    : fillPending(state, trigger.orderId, trigger.price, ctx);
}

// ─── State after a delta ───────────────────────────────────────────────────────

/** The account state once `delta` is applied (positions / pending upserted in place). */
export function applyDelta(state: AccountState, delta: Delta): AccountState {
  const upsert = <T extends { id: string }>(list: T[], removed: string[], changed: T[]): T[] => {
    let next = list.filter((x) => !removed.includes(x.id));
    for (const item of changed) {
      next = next.some((x) => x.id === item.id)
        ? next.map((x) => (x.id === item.id ? item : x))
        : [...next, item];
    }
    return next;
  };
  return {
    balance: delta.account.balance,
    realizedPnl: delta.account.realizedPnl,
    leverage: delta.account.leverage,
    positions: upsert(state.positions, delta.positionsRemove, delta.positionsUpsert),
    pendingOrders: upsert(state.pendingOrders, delta.pendingRemove, delta.pendingUpsert),
  };
}
