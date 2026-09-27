/**
 * Paper-trading actions (BYBIT_PARITY_PLAN BP-1 port, BP-2 Bybit fees and fill prices, BP-3
 * one-way positions, liquidation and re-margining).
 *
 * USDT Perpetual maths (BP-2):
 * - Fees are Bybit's, on notional (qty × price): taker for market, stop, TP/SL and a limit that
 *   crosses the book; maker for a resting limit. Rates live in ../bybitSpec.ts.
 * - Opening costs initial margin (qty × price / leverage) + the open fee + Bybit's estimated fee to
 *   close, priced at the bankruptcy price (BP-3; BP-2 priced it at the entry). The estimate stays
 *   with the position (Bybit's position margin = IM + it) and comes back at close, when the real
 *   close fee is charged.
 * - Every fee is stored where it was charged (Position.entryFee, PendingOrder.reserved, the
 *   order row). A close or refund uses the stored amount — pre-BP-2 rows keep the 0.07% they were
 *   actually charged; nothing is recomputed at today's rates.
 * - Fill prices: market buys fill at the ask, sells at the bid; a resting limit fills at its own
 *   price (F4); stops and TP/SL trigger on the last price and fill at the ask / bid.
 * - Quantity is rounded down to the instrument's qty step; Bybit's minimum qty / value and tick
 *   size are enforced (F9). Leverage is per symbol.
 *
 * One-way mode (BP-3): one position per symbol. A same-side fill merges into it at the qty-weighted
 * average entry; margin, fees and the close-fee reserve add up (stored values, never recomputed).
 * An opposite order closes the position first, then flips (kept from BP-1).
 *
 * Liquidation (BP-3): when the mark price reaches the liquidation price the whole position closes
 * at the bankruptcy price and its whole margin is lost (execType BustTrade, createType
 * CreateByLiq). Leverage can change with a position open: the position (and the symbol's pending
 * orders) are re-margined at the new leverage.
 *
 * Kept from BP-1: S1 (a triggered order that can't fill is recorded as rejected), S2 (a pending
 * order fills with the leverage it was placed with), and every journal / balance-history text.
 *
 * Every action takes the current AccountState and returns a Delta. Nothing here reads a clock,
 * a price feed or the database.
 */

import { Decimal } from '@prisma/client/runtime/client';
import {
  checkOrderSize,
  feeRate,
  feeToClose,
  isOnTick,
  markHitsLiquidation,
  REJECT_PRICE_TICK,
} from '../bybitSpec.js';
import {
  Draft,
  ZERO,
  bookPrice,
  cancelledLegRow,
  clampLeverage,
  crossesBook,
  leverageFor,
  opposite,
  pendingLegCancels,
  positive,
  refused,
  resolveQty,
  triggerPriceField,
  type OrderSize,
} from './draft.js';
import { fmtPrice, pendingSideLabel, pendingTypeLabel } from './format.js';
import { riskOf, tiersFor } from './margin.js';
import { cancelSpotPending, fillSpotPending } from './spot.js';
import { pendingEditEntries, positionExitEditEntries, systemEntry } from './journal.js';
import {
  REJECT_FILL_FAILED,
  REJECT_NOT_ENOUGH_FUNDS,
  STARTING_BALANCE,
  type AccountState,
  type ActionResult,
  type Delta,
  type EngineContext,
  type ExitLeg,
  type HistoricalOrder,
  type InstrumentRules,
  type OrderSide,
  type PendingOrder,
  type Position,
  type PositionSide,
  type Quote,
  type SpotHolding,
} from './types.js';

const FULL_CLOSE_EPSILON = new Decimal('1e-10');
const TAKER = feeRate('linear', 'taker');
const MAKER = feeRate('linear', 'maker');

function closingSide(pos: Position): OrderSide {
  return pos.side === 'long' ? 'sell' : 'buy';
}

/**
 * What opening `qty` at `price` costs — Bybit's order cost: initial margin, open fee and the fee
 * to close at the bankruptcy price.
 */
export function openCost(
  qty: Decimal,
  price: Decimal,
  leverage: number,
  rate: Decimal,
  side: PositionSide
) {
  const notional = qty.times(price);
  const im = notional.div(leverage);
  const openFee = notional.times(rate);
  const closeFeeReserve = feeToClose(side, qty, price, leverage);
  return { im, openFee, closeFeeReserve, total: im.plus(openFee).plus(closeFeeReserve) };
}

/** The position side an order opens. */
const openSide = (side: OrderSide): PositionSide => (side === 'buy' ? 'long' : 'short');

/** What placing a pending order takes from the balance (priced at its trigger, taker fees). */
export function pendingReserve(
  qty: Decimal,
  triggerPrice: Decimal,
  leverage: number,
  side: OrderSide
) {
  return openCost(qty, triggerPrice, leverage, TAKER, openSide(side));
}

// ─── Settling a (partial) close ────────────────────────────────────────────────

/** The money side of closing `closeQty` of `pos` at `price`, with the fee at `rate`. */
function settle(pos: Position, closeQty: Decimal, price: Decimal, rate: Decimal) {
  const fraction = closeQty.div(pos.quantity);
  const pnl =
    pos.side === 'long'
      ? price.minus(pos.entryPrice).times(closeQty)
      : pos.entryPrice.minus(price).times(closeQty);
  const fee = closeQty.times(price).times(rate);
  const margin = pos.entryUsdtAmount.times(fraction);
  const reserve = pos.closeFeeReserve.times(fraction);
  const entryFee = pos.entryFee.times(fraction);
  // The closed part's share of the funding already settled (booked then — not charged again)
  const funding = (pos.cumFunding ?? ZERO).times(fraction);
  // Margin and the close-fee estimate come back, plus the price move, minus the real close fee
  const returnAmount = Decimal.max(0, margin.plus(reserve).plus(pnl).minus(fee));
  return {
    fraction,
    pnl,
    fee,
    margin,
    reserve,
    entryFee,
    funding,
    returnAmount,
    /** Net of the close fee — what the balance history and journal show */
    netPnl: pnl.minus(fee),
    /** Net of both fees — what realized PnL accumulates */
    realized: pnl.minus(fee).minus(entryFee),
  };
}

// ─── Market fill (paperStore.placeOrder) ───────────────────────────────────────

interface FillSpec {
  symbol: string;
  side: OrderSide;
  qty: Decimal;
  /** The execution price (ask / bid, or a resting limit's own price) */
  price: Decimal;
  isMaker: boolean;
  leverage: number;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
}

interface FillOptions {
  skipJournal?: boolean;
  /** The pending order this fill executes, if any */
  fromPending?: PendingOrder;
  /** A limit that crossed the book when placed: recorded as that limit order */
  crossingLimit?: Decimal;
}

/** Order-history row written when a pending order fills (reuses its id and type). */
function pendingFillRecord(
  order: PendingOrder,
  base: Omit<HistoricalOrder, 'id' | 'type' | 'placingTime' | 'category'>
): HistoricalOrder {
  return {
    ...base,
    id: `o-${order.id}`,
    category: 'linear',
    type: order.type,
    ...triggerPriceField(order.type, order.triggerPrice),
    leverage: order.leverage,
    placingTime: order.placedAt,
  };
}

/** The history row for the incoming order: a pending fill, a crossing limit or a market order. */
function incomingRecord(
  id: string,
  base: Omit<HistoricalOrder, 'id' | 'type' | 'placingTime' | 'category'>,
  now: number,
  opts: FillOptions
): HistoricalOrder {
  if (opts.fromPending) return pendingFillRecord(opts.fromPending, base);
  if (opts.crossingLimit) {
    return {
      ...base,
      id,
      category: 'linear',
      type: 'limit',
      limitPrice: opts.crossingLimit,
      placingTime: now,
    };
  }
  return { ...base, id, category: 'linear', type: 'market', placingTime: now };
}

function fillInto(
  d: Draft,
  spec: FillSpec,
  ctx: EngineContext,
  opts: FillOptions = {}
): string | null {
  const { symbol, side, price, isMaker, takeProfit, stopLoss } = spec;
  const leverage = clampLeverage(spec.leverage);
  const rate = isMaker ? MAKER : TAKER;
  const { skipJournal } = opts;
  if (spec.qty.lte(0) || price.lte(0)) return null;
  const now = ctx.now;
  const feeFields = { feeRate: rate, feeAsset: 'USDT', isMaker };

  // ── Position netting (one-way): an opposite order closes existing positions first ──
  const oppositeSide = side === 'buy' ? 'short' : 'long';
  const existingOpp = d.positions.filter((p) => p.symbol === symbol && p.side === oppositeSide);
  let remainingQty = spec.qty;
  let skipOrderRecord = false;

  if (existingOpp.length > 0) {
    let closeFees = ZERO;
    for (const pos of existingOpp) {
      if (remainingQty.lte(0)) break;

      const closeQty = Decimal.min(remainingQty, pos.quantity);
      const isFullClose = closeQty.gte(pos.quantity.minus(FULL_CLOSE_EPSILON));
      const s = settle(pos, closeQty, price, rate);
      const closeId = ctx.newId();
      closeFees = closeFees.plus(s.fee);

      d.prependTrade({
        id: closeId,
        category: 'linear',
        symbol: pos.symbol,
        side: pos.side,
        quantity: closeQty,
        entryPrice: pos.entryPrice,
        exitPrice: price,
        pnl: s.pnl,
        exitCommission: s.fee,
        margin: s.margin,
        openedAt: pos.openedAt,
        closedAt: now,
        ...(s.funding.eq(0) ? {} : { funding: s.funding }),
      });
      if (!skipJournal) {
        const closedSide = pos.side === 'long' ? 'LONG' : 'SHORT';
        d.prependJournal(
          systemEntry(
            `j-close-${closeId}-exec`,
            now,
            `Closed ${closedSide} ${pos.symbol} @ $${fmtPrice(price)}`,
            s.netPnl
          )
        );
      }
      d.prependBalanceEvent({
        id: `bl-close-${closeId}`,
        time: now,
        balanceBefore: d.balance,
        balanceAfter: d.balance.plus(s.returnAmount),
        pnl: s.netPnl,
        action: `Close ${pos.side} position for ${pos.symbol} at price ${price.toFixed(4)} for ${closeQty.toFixed(6)} units`,
      });

      remainingQty = remainingQty.minus(closeQty);
      d.balance = d.balance.plus(s.returnAmount);
      d.realizedPnl = d.realizedPnl.plus(s.realized);
      if (isFullClose) {
        d.removePosition(pos.id);
      } else {
        d.setPosition({
          ...pos,
          quantity: pos.quantity.minus(closeQty),
          entryUsdtAmount: pos.entryUsdtAmount.minus(s.margin),
          entryFee: pos.entryFee.minus(s.entryFee),
          closeFeeReserve: pos.closeFeeReserve.minus(s.reserve),
          ...(pos.cumFunding ? { cumFunding: pos.cumFunding.minus(s.funding) } : {}),
        });
      }
    }

    // One order record per user action (the incoming order), TV-style.
    const leftover = Decimal.max(0, remainingQty);
    const remainderFee = leftover.times(price).times(rate);
    const incomingOrderId = `net-${ctx.newId()}`;
    d.prependOrders(
      incomingRecord(
        `o-${incomingOrderId}`,
        {
          symbol,
          side,
          qty: spec.qty,
          fillPrice: price,
          status: 'filled',
          commission: closeFees.plus(remainderFee),
          ...feeFields,
          closingTime: now,
        },
        now,
        opts
      )
    );

    if (remainingQty.lte(FULL_CLOSE_EPSILON)) return incomingOrderId;

    // Flip: open the remainder as a new position; its order record is already written.
    skipOrderRecord = true;
  }

  const positionSide = openSide(side);
  const cost = openCost(remainingQty, price, leverage, rate, positionSide);
  // Fees are part of the balance check, so a 100%-of-balance order can't go negative.
  if (cost.total.gt(d.balance)) {
    const base = {
      symbol,
      side,
      qty: remainingQty,
      status: 'rejected' as const,
      commission: ZERO,
      margin: cost.im,
      closingTime: now,
      rejectionReason: REJECT_NOT_ENOUGH_FUNDS,
    };
    d.prependOrders(
      skipOrderRecord
        ? {
            ...base,
            id: `o-rej-${ctx.newId()}`,
            category: 'linear',
            type: 'market',
            placingTime: now,
          }
        : incomingRecord(`o-rej-${ctx.newId()}`, base, now, opts)
    );
    return null;
  }

  const id = ctx.newId();
  const tp = positive(takeProfit);
  const sl = positive(stopLoss);
  // One-way mode: a same-side position on the symbol absorbs this fill (BP-3)
  const existing = d.positions.find((p) => p.symbol === symbol && p.side === positionSide);

  if (existing) {
    const quantity = existing.quantity.plus(remainingQty);
    const entryUsdtAmount = existing.entryUsdtAmount.plus(cost.im);
    const entryPrice = existing.entryPrice
      .times(existing.quantity)
      .plus(price.times(remainingQty))
      .div(quantity)
      .toDecimalPlaces(8);
    d.setPosition({
      ...existing,
      quantity,
      entryPrice,
      entryUsdtAmount,
      // Same leverage on both parts in practice (a leverage change re-margins the position and the
      // symbol's orders); otherwise the merged position's effective leverage
      leverage:
        existing.leverage === leverage
          ? leverage
          : clampLeverage(quantity.times(entryPrice).div(entryUsdtAmount).toNumber()),
      entryFee: existing.entryFee.plus(cost.openFee),
      closeFeeReserve: existing.closeFeeReserve.plus(cost.closeFeeReserve),
      // Bybit Full-mode TP/SL: a TP / SL attached to this order replaces the position's
      ...(tp ? { takeProfit: tp } : {}),
      ...(sl ? { stopLoss: sl } : {}),
    });
  } else {
    d.setPosition({
      id,
      category: 'linear',
      symbol,
      side: positionSide,
      quantity: remainingQty,
      entryPrice: price,
      entryUsdtAmount: cost.im,
      leverage,
      entryFee: cost.openFee,
      closeFeeReserve: cost.closeFeeReserve,
      openedAt: now,
      ...(tp ? { takeProfit: tp } : {}),
      ...(sl ? { stopLoss: sl } : {}),
    });
  }

  if (!skipOrderRecord) {
    d.prependOrders(
      incomingRecord(
        `o-${id}`,
        {
          symbol,
          side,
          qty: remainingQty,
          fillPrice: price,
          status: 'filled',
          commission: cost.openFee,
          ...feeFields,
          margin: cost.im,
          leverage,
          closingTime: now,
        },
        now,
        opts
      )
    );
  }

  const verb = existing ? 'Add to' : 'Enter';
  d.prependBalanceEvent({
    id: `bl-${id}`,
    time: now,
    balanceBefore: d.balance,
    balanceAfter: d.balance.minus(cost.total),
    pnl: ZERO,
    action: `${verb} ${positionSide} position for ${symbol} at price ${price.toFixed(4)} for ${remainingQty.toFixed(6)} units`,
  });
  if (!skipJournal) {
    const label = positionSide === 'long' ? 'LONG' : 'SHORT';
    d.prependJournal(
      systemEntry(
        `j-${id}-open`,
        now,
        existing
          ? `Added to ${label} ${symbol} @ $${fmtPrice(price)} (qty: ${remainingQty.toFixed(6)})`
          : `Opened ${label} ${symbol} @ $${fmtPrice(price)}`
      )
    );
  }
  d.balance = d.balance.minus(cost.total);
  return existing ? existing.id : id;
}

export interface MarketIntent {
  symbol: string;
  side: OrderSide;
  size: OrderSize;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
}

/**
 * Market order: buys fill at the ask, sells at the bid (taker). Result: the new position /
 * order id, or null when rejected for funds. `invalid` is set when Bybit's size rules refuse it.
 */
export function placeMarket(
  state: AccountState,
  intent: MarketIntent,
  quote: Quote,
  rules: InstrumentRules,
  ctx: EngineContext
): ActionResult<string | null> {
  const leverage = leverageFor(state, intent.symbol);
  const price = bookPrice(intent.side, quote);
  const qty = resolveQty(intent.size, price, leverage, rules);
  const invalid = checkOrderSize('linear', rules, qty, price);
  if (invalid) return refused(state, null, invalid);

  const d = new Draft(state);
  const id = fillInto(
    d,
    {
      symbol: intent.symbol,
      side: intent.side,
      qty,
      price,
      isMaker: false,
      leverage,
      takeProfit: intent.takeProfit,
      stopLoss: intent.stopLoss,
    },
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

  // Every close is a taker order (market, or a triggered TP / SL)
  const s = settle(pos, pos.quantity, exitPrice, TAKER);
  const now = ctx.now;
  const closedId = ctx.newId();

  d.prependTrade({
    id: positionId,
    category: 'linear',
    symbol: pos.symbol,
    side: pos.side,
    quantity: pos.quantity,
    entryPrice: pos.entryPrice,
    exitPrice,
    pnl: s.pnl,
    exitCommission: s.fee,
    margin: pos.entryUsdtAmount,
    openedAt: pos.openedAt,
    closedAt: now,
    ...(s.funding.eq(0) ? {} : { funding: s.funding }),
  });

  const closingOrder: HistoricalOrder = {
    id: `o-close-${closedId}`,
    category: 'linear',
    symbol: pos.symbol,
    side: closingSide(pos),
    type: closeType ?? 'market',
    qty: pos.quantity,
    fillPrice: exitPrice,
    status: 'filled',
    commission: s.fee,
    feeRate: TAKER,
    feeAsset: 'USDT',
    isMaker: false,
    placingTime: now,
    closingTime: now,
  };
  const siblingCancels: HistoricalOrder[] = [];
  const cancelExit = (leg: ExitLeg, price: Decimal) => {
    siblingCancels.push(
      cancelledLegRow(
        `o-cancel-${leg}-${positionId}-${now}`,
        leg,
        pos.symbol,
        closingSide(pos),
        pos.quantity,
        price,
        pos.openedAt,
        now
      )
    );
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

  d.prependBalanceEvent({
    id: `bl-close-${closedId}`,
    time: now,
    balanceBefore: d.balance,
    balanceAfter: d.balance.plus(s.returnAmount),
    pnl: s.netPnl,
    action: `Close ${pos.side} position for ${pos.symbol} at price ${exitPrice.toFixed(4)} for ${pos.quantity.toFixed(6)} units`,
  });
  d.prependJournal(
    reason
      ? systemEntry(`j-close-${closedId}-reason`, now, reason, s.netPnl)
      : systemEntry(
          `j-close-${closedId}-exec`,
          now,
          `Closed ${pos.side === 'long' ? 'LONG' : 'SHORT'} ${pos.symbol} @ $${fmtPrice(exitPrice)}`,
          s.netPnl
        )
  );

  d.balance = d.balance.plus(s.returnAmount);
  d.realizedPnl = d.realizedPnl.plus(s.realized);
  d.removePosition(positionId);
  return s.pnl;
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

/** The price a position closes at: a long sells into the bid, a short buys at the ask. */
export function closePrice(pos: Pick<Position, 'side'>, quote: Quote): Decimal {
  return pos.side === 'long' ? quote.bid : quote.ask;
}

/** Manual (market) close. Result: gross PnL, or null if not found. */
export function closePosition(
  state: AccountState,
  positionId: string,
  quote: Quote,
  ctx: EngineContext
): ActionResult<Decimal | null> {
  const pos = state.positions.find((p) => p.id === positionId);
  if (!pos) return closePositionAs(state, positionId, ZERO, ctx); // not found → no-op
  return closePositionAs(state, positionId, closePrice(pos, quote), ctx);
}

/** TP/SL auto-close at `fillPrice` (the browser's useTPSLMonitor). */
export function closeOnExit(
  state: AccountState,
  positionId: string,
  leg: ExitLeg,
  fillPrice: Decimal,
  ctx: EngineContext
): ActionResult<Decimal | null> {
  const pos = state.positions.find((p) => p.id === positionId);
  if (!pos) return closePositionAs(state, positionId, fillPrice, ctx);
  const label = leg === 'take-profit' ? 'Take-Profit' : 'Stop-Loss';
  const reason = `Auto-closed ${pos.side.toUpperCase()} ${pos.symbol} — ${label} hit at $${fmtPrice(fillPrice)}`;
  return closePositionAs(state, positionId, fillPrice, ctx, reason, leg);
}

// ─── Liquidation (BP-3) ────────────────────────────────────────────────────────

/**
 * Isolated-margin liquidation, as on Bybit: the mark price reached the position's liquidation
 * price, so the whole position closes at the bankruptcy price and its whole margin is lost — IM,
 * the close-fee reserve and any extra margin. Nothing comes back to the wallet: the price move to
 * the bankruptcy price consumes IM + extra margin, and the reserve pays the close fee (whatever it
 * doesn't need goes with it, like Bybit's insurance-fund top-up).
 *
 * Before the close, the symbol's active USDT Perpetual orders are cancelled and their reserves
 * refunded (Bybit cancels a contract's active orders when it liquidates the position).
 *
 * `mark` is the mark price that triggered it (for the journal). Result: gross PnL, or null if the
 * position no longer exists.
 */
export function liquidatePosition(
  state: AccountState,
  positionId: string,
  mark: Decimal,
  ctx: EngineContext
): ActionResult<Decimal | null> {
  const d = new Draft(state);
  const pos = d.positions.find((p) => p.id === positionId);
  if (!pos) return { delta: d.toDelta(), result: null };

  const now = ctx.now;
  const risk = riskOf(pos, tiersFor(ctx, pos.symbol));
  const bust = risk.bustPrice;
  const label = pos.side === 'long' ? 'LONG' : 'SHORT';

  // 1. Cancel the contract's active orders (refund their reserves)
  for (const order of d.pending.filter((o) => o.category === 'linear' && o.symbol === pos.symbol)) {
    d.prependOrders(
      {
        id: `o-cancel-liq-${order.id}`,
        category: 'linear',
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        qty: order.qty,
        ...triggerPriceField(order.type, order.triggerPrice),
        status: 'cancelled',
        commission: ZERO,
        placingTime: order.placedAt,
        closingTime: now,
      },
      ...pendingLegCancels(order, (leg) => `o-cancel-liq-${leg}-${order.id}`, now)
    );
    d.prependJournal(
      systemEntry(
        `j-cancel-liq-${order.id}`,
        now,
        `Cancelled ${pendingTypeLabel(order.type)} ${pendingSideLabel(order.side)} ${order.symbol} @ $${fmtPrice(order.triggerPrice)}` +
          ` before liquidation (refunded: $${order.reserved.toFixed(2)})`
      )
    );
    d.balance = d.balance.plus(order.reserved);
    d.removePending(order.id);
  }

  // 2. Close the whole position at the bankruptcy price
  const pnl =
    pos.side === 'long'
      ? bust.minus(pos.entryPrice).times(pos.quantity)
      : pos.entryPrice.minus(bust).times(pos.quantity);
  const fee = pos.closeFeeReserve;
  const netPnl = pnl.minus(fee);
  const closedId = ctx.newId();

  d.prependTrade({
    id: positionId,
    category: 'linear',
    symbol: pos.symbol,
    side: pos.side,
    quantity: pos.quantity,
    entryPrice: pos.entryPrice,
    exitPrice: bust,
    pnl,
    exitCommission: fee,
    margin: pos.entryUsdtAmount,
    openedAt: pos.openedAt,
    closedAt: now,
    execType: 'BustTrade',
    ...(pos.cumFunding && !pos.cumFunding.eq(0) ? { funding: pos.cumFunding } : {}),
  });
  const legCancels: HistoricalOrder[] = [];
  for (const [leg, price] of [
    ['take-profit', pos.takeProfit],
    ['stop-loss', pos.stopLoss],
  ] as const) {
    if (!price) continue;
    legCancels.push(
      cancelledLegRow(
        `o-cancel-${leg}-${positionId}-${now}`,
        leg,
        pos.symbol,
        closingSide(pos),
        pos.quantity,
        price,
        pos.openedAt,
        now
      )
    );
  }
  d.prependOrders(
    {
      id: `o-liq-${closedId}`,
      category: 'linear',
      symbol: pos.symbol,
      side: closingSide(pos),
      type: 'market',
      qty: pos.quantity,
      fillPrice: bust,
      status: 'filled',
      commission: fee,
      feeRate: TAKER,
      feeAsset: 'USDT',
      isMaker: false,
      placingTime: now,
      closingTime: now,
      createType: 'CreateByLiq',
    },
    ...legCancels
  );
  d.prependBalanceEvent({
    id: `bl-liq-${closedId}`,
    time: now,
    balanceBefore: d.balance,
    balanceAfter: d.balance,
    pnl: netPnl,
    action: `Liquidation of ${pos.side} position for ${pos.symbol} at bankruptcy price ${bust.toFixed(4)} for ${pos.quantity.toFixed(6)} units`,
  });
  d.prependJournal(
    systemEntry(
      `j-liq-${closedId}`,
      now,
      `Liquidated ${label} ${pos.symbol} — mark price $${fmtPrice(mark)} reached the liquidation price ` +
        `$${fmtPrice(risk.liqPrice)}; closed at the bankruptcy price $${fmtPrice(bust)}`,
      netPnl
    )
  );
  d.realizedPnl = d.realizedPnl.plus(netPnl).minus(pos.entryFee);
  d.removePosition(positionId);
  return { delta: d.toDelta(), result: pnl, sound: 'liquidation' };
}

// ─── Pending orders (paperStore.placeLimitOrder / placeStopOrder) ──────────────

export interface PendingIntent {
  symbol: string;
  side: OrderSide;
  type: 'limit' | 'stop';
  triggerPrice: Decimal;
  size: OrderSize;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
}

/**
 * Limit / stop order. A limit that crosses the book fills now as a taker at the ask / bid (never
 * worse than its limit); otherwise the order rests and reserves IM + estimated fees.
 * Result: the order / position id, or null (not enough funds — no record, as in the browser).
 */
export function placePending(
  state: AccountState,
  intent: PendingIntent,
  quote: Quote | undefined,
  rules: InstrumentRules,
  ctx: EngineContext
): ActionResult<string | null> {
  const { symbol, side, type, triggerPrice } = intent;
  if (triggerPrice.lte(0)) return refused(state, null, 'Trigger price must be positive');
  if (!isOnTick(triggerPrice, rules.tickSize)) {
    return refused(state, null, REJECT_PRICE_TICK(rules.tickSize));
  }
  const leverage = leverageFor(state, symbol);
  const qty = resolveQty(intent.size, triggerPrice, leverage, rules);
  const invalid = checkOrderSize('linear', rules, qty, triggerPrice);
  if (invalid) return refused(state, null, invalid);

  const d = new Draft(state);

  if (type === 'limit' && quote && crossesBook(side, triggerPrice, quote)) {
    const id = fillInto(
      d,
      {
        symbol,
        side,
        qty,
        price: bookPrice(side, quote),
        isMaker: false,
        leverage,
        takeProfit: intent.takeProfit,
        stopLoss: intent.stopLoss,
      },
      ctx,
      { crossingLimit: triggerPrice }
    );
    return { delta: d.toDelta(), result: id, ...(id ? { sound: 'placed' as const } : {}) };
  }

  const reserve = pendingReserve(qty, triggerPrice, leverage, side);
  if (reserve.total.gt(d.balance)) return { delta: d.toDelta(), result: null };

  const id = ctx.newId();
  const now = ctx.now;
  const tp = positive(intent.takeProfit);
  const sl = positive(intent.stopLoss);

  d.setPending({
    id,
    category: 'linear',
    symbol,
    side,
    type,
    usdtAmount: reserve.im,
    reserved: reserve.total,
    triggerPrice,
    qty,
    leverage,
    placedAt: now,
    ...(tp ? { takeProfit: tp } : {}),
    ...(sl ? { stopLoss: sl } : {}),
  });
  d.prependJournal(
    systemEntry(
      `j-place-${type}-${id}`,
      now,
      `Placed ${pendingTypeLabel(type)} ${pendingSideLabel(side)} ${symbol} @ $${fmtPrice(triggerPrice)}` +
        ` (qty: ${qty.toFixed(6)}, reserved: $${reserve.total.toFixed(2)})`
    )
  );
  d.balance = d.balance.minus(reserve.total);
  return { delta: d.toDelta(), result: id, sound: 'queued' };
}

/** paperStore.cancelPendingOrder — refunds exactly what placing it reserved. */
export function cancelPending(
  state: AccountState,
  orderId: string,
  ctx: EngineContext
): ActionResult<boolean> {
  const d = new Draft(state);
  const order = d.pending.find((o) => o.id === orderId);
  if (!order) return { delta: d.toDelta(), result: false };
  // A spot order's reserve may be coins, not USDT
  if (order.category === 'spot') return cancelSpotPending(state, orderId, ctx);

  const refund = order.reserved;
  const now = ctx.now;
  d.prependOrders(
    {
      id: `o-cancel-${orderId}`,
      category: order.category,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      qty: order.qty,
      ...triggerPriceField(order.type, order.triggerPrice),
      status: 'cancelled',
      commission: ZERO,
      placingTime: order.placedAt,
      closingTime: now,
    },
    ...pendingLegCancels(order, (leg) => `o-cancel-${leg}-${orderId}`, now)
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
  d.prependOrders(
    cancelledLegRow(
      `o-cancel-${leg}-${positionId}-${now}`,
      leg,
      pos.symbol,
      closingSide(pos),
      pos.quantity,
      target,
      pos.openedAt,
      now
    )
  );
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
  d.prependOrders(
    cancelledLegRow(
      `o-cancel-pending-${leg}-${orderId}-${now}`,
      leg,
      order.symbol,
      opposite(order.side),
      order.qty,
      target,
      order.placedAt,
      now,
      order.category
    )
  );
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
  const side = closingSide(pos);
  if (takeProfit === null && pos.takeProfit) {
    rows.push(
      cancelledLegRow(
        `o-cancel-tp-edit-${positionId}-${now}`,
        'take-profit',
        pos.symbol,
        side,
        pos.quantity,
        pos.takeProfit,
        pos.openedAt,
        now
      )
    );
  }
  if (stopLoss === null && pos.stopLoss) {
    rows.push(
      cancelledLegRow(
        `o-cancel-sl-edit-${positionId}-${now}`,
        'stop-loss',
        pos.symbol,
        side,
        pos.quantity,
        pos.stopLoss,
        pos.openedAt,
        now
      )
    );
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

export interface PendingEdit {
  triggerPrice: Decimal;
  size: OrderSize;
  takeProfit: Decimal | null;
  stopLoss: Decimal | null;
}

/**
 * paperStore.editPendingOrder. The order keeps its leverage (a symbol's leverage change re-margins
 * its orders). A limit edited across the book fills now as a taker, as on Bybit. Not enough funds
 * rejects the edit and cancels the order (refunding its reserve), as in the browser.
 */
export function editPending(
  state: AccountState,
  orderId: string,
  edit: PendingEdit,
  quote: Quote | undefined,
  rules: InstrumentRules,
  ctx: EngineContext
): ActionResult<EditPendingResult> {
  const order = state.pendingOrders.find((o) => o.id === orderId);
  if (!order) return { delta: new Draft(state).toDelta(), result: 'not-found' };

  const newTrigger = edit.triggerPrice;
  if (newTrigger.lte(0)) return refused(state, 'rejected', 'Trigger price must be positive');
  if (!isOnTick(newTrigger, rules.tickSize)) {
    return refused(state, 'rejected', REJECT_PRICE_TICK(rules.tickSize));
  }
  const leverage = clampLeverage(order.leverage);
  const newQty = resolveQty(edit.size, newTrigger, leverage, rules);
  const invalid = checkOrderSize('linear', rules, newQty, newTrigger);
  if (invalid) return refused(state, 'rejected', invalid);

  const d = new Draft(state);
  const now = ctx.now;
  const oldReserved = order.reserved;
  const scratchBalance = d.balance.plus(oldReserved);
  const reserve = pendingReserve(newQty, newTrigger, leverage, order.side);
  const typeLabel = pendingTypeLabel(order.type);
  const sideLabel = pendingSideLabel(order.side);
  // A limit moved across the book trades now: its cost is decided at the ask / bid (below), not
  // by a reserve priced at the new limit
  const crossing = order.type === 'limit' && !!quote && crossesBook(order.side, newTrigger, quote);

  if (!crossing && reserve.total.gt(scratchBalance)) {
    // Not enough funds: reject the edit, cancel the order and its exit legs, refund the reserve.
    d.prependOrders(
      {
        id: `o-rej-edit-${orderId}-${now}`,
        category: order.category,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        qty: newQty,
        ...triggerPriceField(order.type, newTrigger),
        status: 'rejected',
        commission: ZERO,
        margin: reserve.im,
        placingTime: order.placedAt,
        closingTime: now,
        rejectionReason: REJECT_NOT_ENOUGH_FUNDS,
      },
      ...pendingLegCancels(order, (leg) => `o-cancel-${leg}-rej-${orderId}-${now}`, now)
    );
    d.prependJournal(
      systemEntry(
        `j-rej-edit-${orderId}-${now}`,
        now,
        `${typeLabel} ${sideLabel} ${order.symbol} order rejected — Not enough funds ($${reserve.total.toFixed(2)} required, $${scratchBalance.toFixed(2)} available)`
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

  const exitCancels: HistoricalOrder[] = [];
  const legSide = opposite(order.side);
  if (edit.takeProfit === null && order.takeProfit) {
    exitCancels.push(
      cancelledLegRow(
        `o-cancel-tp-edit-pending-${orderId}-${now}`,
        'take-profit',
        order.symbol,
        legSide,
        order.qty,
        order.takeProfit,
        order.placedAt,
        now
      )
    );
  }
  if (edit.stopLoss === null && order.stopLoss) {
    exitCancels.push(
      cancelledLegRow(
        `o-cancel-sl-edit-pending-${orderId}-${now}`,
        'stop-loss',
        order.symbol,
        legSide,
        order.qty,
        order.stopLoss,
        order.placedAt,
        now
      )
    );
  }
  if (exitCancels.length) d.prependOrders(...exitCancels);

  // A limit moved across the book trades now (taker), with the edited TP / SL
  if (crossing && quote) {
    d.balance = d.balance.plus(oldReserved);
    d.removePending(orderId);
    const edited: PendingOrder = { ...order, triggerPrice: newTrigger, qty: newQty, leverage };
    const posId = fillInto(
      d,
      {
        symbol: order.symbol,
        side: order.side,
        qty: newQty,
        price: bookPrice(order.side, quote),
        isMaker: false,
        leverage,
        takeProfit: edit.takeProfit ?? undefined,
        stopLoss: edit.stopLoss ?? undefined,
      },
      ctx,
      { fromPending: edited }
    );
    return {
      delta: d.toDelta(),
      result: posId ? 'ok' : 'rejected',
      ...(posId ? { sound: 'filled' as const } : {}),
    };
  }

  const entries = pendingEditEntries(
    order,
    newTrigger,
    reserve.total,
    newQty,
    edit.takeProfit,
    edit.stopLoss,
    now
  );
  if (entries.length) d.prependJournal(...entries);

  const updated: PendingOrder = {
    ...order,
    triggerPrice: newTrigger,
    usdtAmount: reserve.im,
    reserved: reserve.total,
    qty: newQty,
    leverage, // the fill uses it (S2)
  };
  if (edit.takeProfit !== null) updated.takeProfit = edit.takeProfit;
  else delete updated.takeProfit;
  if (edit.stopLoss !== null) updated.stopLoss = edit.stopLoss;
  else delete updated.stopLoss;
  d.setPending(updated);
  d.balance = d.balance.plus(oldReserved).minus(reserve.total);
  return { delta: d.toDelta(), result: 'ok' };
}

// ─── Pending fill (usePendingOrderMonitor + fillPendingOrder + placeOrder) ─────

/**
 * Executes a triggered pending order at `fill.price`. Its reserve is released first; the fill then
 * charges margin + fees at the fill price. If that can't be paid (a stop filled well past its
 * trigger with a tight balance), the order is recorded as rejected, never dropped (S1).
 */
export function fillPending(
  state: AccountState,
  orderId: string,
  fill: { price: Decimal; isMaker: boolean },
  ctx: EngineContext
): ActionResult<string | null> {
  const d = new Draft(state);
  const order = d.pending.find((o) => o.id === orderId);
  if (!order) return { delta: d.toDelta(), result: null };

  d.balance = d.balance.plus(order.reserved);
  d.removePending(orderId);

  const posId = fillInto(
    d,
    {
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      price: fill.price,
      isMaker: fill.isMaker,
      leverage: order.leverage,
      takeProfit: order.takeProfit,
      stopLoss: order.stopLoss,
    },
    ctx,
    { skipJournal: true, fromPending: order }
  );

  const typeLabel = order.type === 'limit' ? 'Limit' : 'Stop';
  const sideLabel = pendingSideLabel(order.side);
  const note = (text: string) =>
    d.prependJournal(systemEntry(`j-note-${ctx.newId()}`, ctx.now, text));

  if (posId) {
    note(
      `${typeLabel} order filled — ${sideLabel} ${order.symbol} @ $${fmtPrice(fill.price)} ` +
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
  // S1: the order must always leave a trace in order history. fillInto already wrote a
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
    `${typeLabel} order for ${order.symbol} triggered @ $${fmtPrice(fill.price)} but could not be filled`
  );
  return { delta: d.toDelta(), result: null };
}

// ─── Account & journal ─────────────────────────────────────────────────────────

export const REJECT_LEVERAGE_BALANCE =
  'Insufficient available balance to change leverage (more margin is needed at the new leverage).';
export const REJECT_LEVERAGE_LIQUIDATION =
  "Leverage can't be raised: the position would be liquidated at the current mark price.";
export const REJECT_LEVERAGE_NO_MARK = 'Waiting for live price…';

/**
 * Per-symbol leverage (USDT Perpetual). With nothing open on the symbol it is only a setting. With
 * an open position or active orders, they are re-margined at the new leverage, as on Bybit (BP-3):
 * - IM = qty × entry (or trigger) / new leverage, and the fee to close is re-estimated at the new
 *   bankruptcy price; the difference moves between the wallet and the position / order.
 * - Lowering leverage needs the extra margin in the wallet, else it is refused.
 * - Raising leverage releases margin, but is refused when the position's new liquidation price
 *   would already be reached by the current mark price (`mark`).
 */
export function setSymbolLeverage(
  state: AccountState,
  symbol: string,
  value: number,
  ctx: EngineContext,
  mark?: Decimal
): ActionResult<number> {
  const current = leverageFor(state, symbol);
  const next = clampLeverage(value);
  const positions = state.positions.filter((p) => p.symbol === symbol);
  const orders = state.pendingOrders.filter((o) => o.symbol === symbol && o.category === 'linear');
  const d = new Draft(state);
  d.symbolLeverage = { ...d.symbolLeverage, [symbol]: next };
  const busy = positions.length > 0 || orders.length > 0;
  if (!busy || (next === current && positions.every((p) => p.leverage === next))) {
    return { delta: d.toDelta(), result: leverageFor(d, symbol) };
  }

  const tiers = tiersFor(ctx, symbol);
  let change = ZERO; // margin moved from the wallet into positions / orders (negative = released)
  for (const pos of positions) {
    const im = pos.quantity.times(pos.entryPrice).div(next);
    const reserve = feeToClose(pos.side, pos.quantity, pos.entryPrice, next);
    const updated: Position = {
      ...pos,
      leverage: next,
      entryUsdtAmount: im,
      closeFeeReserve: reserve,
    };
    if (im.lt(pos.entryUsdtAmount)) {
      // Less margin behind the position: it must not be liquidated by the change itself
      if (!mark) return refused(state, current, REJECT_LEVERAGE_NO_MARK);
      if (markHitsLiquidation(pos.side, riskOf(updated, tiers).liqPrice, mark)) {
        return refused(state, current, REJECT_LEVERAGE_LIQUIDATION);
      }
    }
    change = change.plus(im.plus(reserve)).minus(pos.entryUsdtAmount.plus(pos.closeFeeReserve));
    d.setPosition(updated);
  }
  for (const order of orders) {
    const reserve = pendingReserve(order.qty, order.triggerPrice, next, order.side);
    change = change.plus(reserve.total).minus(order.reserved);
    d.setPending({ ...order, leverage: next, usdtAmount: reserve.im, reserved: reserve.total });
  }
  if (change.gt(d.balance)) return refused(state, current, REJECT_LEVERAGE_BALANCE);

  const now = ctx.now;
  const moved = change.abs().toFixed(2);
  const note = change.gt(0)
    ? `margin added: $${moved}`
    : change.lt(0)
      ? `margin released: $${moved}`
      : 'no margin change';
  d.prependJournal(
    systemEntry(
      `j-leverage-${symbol}-${now}`,
      now,
      `Leverage for ${symbol} changed ${current}x → ${next}x (${note})`
    )
  );
  if (!change.eq(0)) {
    d.prependBalanceEvent({
      id: `bl-leverage-${symbol}-${now}`,
      time: now,
      balanceBefore: d.balance,
      balanceAfter: d.balance.minus(change),
      pnl: ZERO,
      action: `Adjust margin for ${symbol}: leverage ${current}x → ${next}x`,
    });
  }
  d.balance = d.balance.minus(change);
  return { delta: d.toDelta(), result: next };
}

/**
 * Default leverage for symbols with no setting of their own (BP-1's account-wide leverage, kept
 * for pre-BP-2 clients). A symbol with open trades keeps the leverage it has: its current value is
 * pinned as its own setting first, so changing the default never re-margins anything — only
 * setSymbolLeverage does.
 */
export function setLeverage(state: AccountState, value: number): ActionResult<number> {
  const d = new Draft(state);
  const busy = new Set([
    ...state.positions.map((p) => p.symbol),
    ...state.pendingOrders.filter((o) => o.category === 'linear').map((o) => o.symbol),
  ]);
  const pinned = { ...d.symbolLeverage };
  for (const symbol of busy) {
    // symbol comes from the account's own positions / orders (allow-listed) — safe, controlled access
    // eslint-disable-next-line security/detect-object-injection
    if (!(symbol in pinned)) pinned[symbol] = leverageFor(state, symbol);
  }
  d.symbolLeverage = pinned;
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
  // Spot balances are wiped with the rest (delta.reset): applyDelta drops them
  d.balance = new Decimal(STARTING_BALANCE);
  d.realizedPnl = ZERO;
  d.leverage = 1;
  d.symbolLeverage = {};
  d.symbolFundingAt = {};
  d.reset = true;
  return { delta: d.toDelta(), result: true };
}

// ─── Funding (BP-4) ────────────────────────────────────────────────────────────

/** A position as it was at the funding timestamp (the engine snapshots them at that instant). */
export interface FundingSnapshot {
  positionId: string;
  side: PositionSide;
  qty: Decimal;
}

export interface FundingSpec {
  symbol: string;
  /** The funding timestamp (Unix ms) */
  ts: number;
  /** Settled funding rate */
  rate: Decimal;
  /** Mark price at the timestamp */
  mark: Decimal;
  /** The account's positions on `symbol` held at `ts` */
  positions: FundingSnapshot[];
}

const fmtRate = (rate: Decimal) => `${rate.times(100).toDecimalPlaces(4).toFixed(4)}%`;

/**
 * Settles one funding timestamp for one account, as Bybit (UTA, isolated margin):
 * - fee = size × mark × rate for each position held at `ts`; a long pays a positive rate, a short
 *   receives it (the reverse for a negative rate). Signed as Bybit's execFee: + = paid.
 * - Paid from the balance; any shortfall from that position's margin, which moves its
 *   liquidation price toward the mark. A position closed since `ts` still pays (it was held at the
 *   timestamp), from the balance only. Received funding goes to the balance.
 * - Booked in realized PnL now (a later close carries the share, for Closed P&L, without charging
 *   it again) and in the position's `cumFunding`.
 * - Idempotent: a timestamp at or before `symbolFundingAt[symbol]` is a no-op, and so is one
 *   before the account's last reset (the snapshot holds positions the reset wiped).
 */
export function settleFunding(
  state: AccountState,
  spec: FundingSpec,
  // Same shape as every action; every record is stamped at the funding timestamp, not ctx.now
  _ctx: EngineContext
): ActionResult<number> {
  const d = new Draft(state);
  const { symbol, ts, rate, mark } = spec;
  // symbol is an allow-listed symbol from the engine's own index — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  const settledTo = state.symbolFundingAt[symbol];
  // A reset after the timestamp wiped the snapshotted positions (and the marker): not this account's
  const resetSince = state.resetAt !== undefined && state.resetAt > ts;
  if ((settledTo !== undefined && settledTo >= ts) || resetSince || spec.positions.length === 0) {
    return { delta: d.toDelta(), result: 0 };
  }

  let settled = 0;
  for (const snap of spec.positions) {
    if (snap.qty.lte(0)) continue;
    const signed = snap.qty.times(mark).times(rate).toDecimalPlaces(8);
    const fee = snap.side === 'long' ? signed : signed.neg();
    if (fee.eq(0)) continue;
    const pos = d.positions.find((p) => p.id === snap.positionId);
    const label = snap.side === 'long' ? 'LONG' : 'SHORT';
    const balanceBefore = d.balance;

    // What is actually charged: a paid fee the balance and the position's margin can't cover (the
    // position is already closed, the wallet is empty) is not collected
    let charged = fee;
    if (fee.gt(0)) {
      const fromBalance = Decimal.min(fee, Decimal.max(ZERO, d.balance));
      d.balance = d.balance.minus(fromBalance);
      const shortfall = fee.minus(fromBalance);
      let fromMargin = ZERO;
      if (shortfall.gt(0) && pos) {
        // 🔐 Never below zero margin: at worst the position is left at its bankruptcy price and the
        // next mark tick liquidates it
        fromMargin = Decimal.min(shortfall, pos.entryUsdtAmount);
        d.setPosition({ ...pos, entryUsdtAmount: pos.entryUsdtAmount.minus(fromMargin) });
      }
      charged = fromBalance.plus(fromMargin);
    } else {
      d.balance = d.balance.minus(fee);
    }
    if (charged.eq(0)) continue;
    d.realizedPnl = d.realizedPnl.minus(charged);
    const current = d.positions.find((p) => p.id === snap.positionId);
    if (current) {
      d.setPosition({ ...current, cumFunding: (current.cumFunding ?? ZERO).plus(charged) });
    }

    const id = `fund-${snap.positionId}-${ts}`;
    d.prependFunding({
      id,
      symbol,
      side: snap.side,
      qty: snap.qty,
      markPrice: mark,
      rate,
      fee: charged,
      time: ts,
    });
    const paid = charged.gt(0);
    // Stamped at the funding timestamp, like the execution — a backfilled settlement runs later
    d.prependBalanceEvent({
      id: `bl-${id}`,
      time: ts,
      balanceBefore,
      balanceAfter: d.balance,
      pnl: charged.neg(),
      action: `Funding fee for ${label.toLowerCase()} ${symbol} (rate ${fmtRate(rate)}, mark ${mark.toFixed(4)}, ${snap.qty.toFixed(6)} units)`,
    });
    d.prependJournal(
      systemEntry(
        `j-${id}`,
        ts,
        `Funding ${paid ? 'fee' : 'received'} ${paid ? '−' : '+'}$${charged.abs().toFixed(4)} · ${label} ${symbol} ${snap.qty.toFixed(6)} @ mark $${fmtPrice(mark)}, rate ${fmtRate(rate)}`,
        charged.neg()
      )
    );
    settled++;
  }
  d.symbolFundingAt = { ...d.symbolFundingAt, [symbol]: ts };
  return { delta: d.toDelta(), result: settled };
}

// ─── Trigger execution ─────────────────────────────────────────────────────────

export type ExecutableTrigger =
  | {
      kind: 'exit';
      positionId: string;
      leg: ExitLeg;
      price: Decimal;
      fillAt?: Decimal;
      at?: number;
    }
  | { kind: 'fill'; orderId: string; price: Decimal; fillAt?: Decimal; at?: number }
  | {
      kind: 'liquidation';
      positionId: string;
      price: Decimal;
      fillAt?: Decimal;
      at?: number;
    };

/**
 * Runs a trigger found by evaluateTick / evaluateCandle: a liquidation, a TP/SL close or a pending
 * fill. A liquidation (mark price) always settles at the bankruptcy price. The others fire on the
 * last price; the fill price is decided here:
 * - resting limit → its own price, maker (F4);
 * - stop, TP, SL → the ask / bid of the live `quote` (taker). A backfilled trigger has no quote
 *   and fills at the level it crossed (`fillAt`); with no quote at all, at the trigger price.
 */
export function executeTrigger(
  state: AccountState,
  trigger: ExecutableTrigger,
  quote: Quote | undefined,
  ctx: EngineContext
): ActionResult<unknown> {
  if (trigger.kind === 'liquidation') {
    return liquidatePosition(state, trigger.positionId, trigger.price, ctx);
  }
  if (trigger.kind === 'exit') {
    const pos = state.positions.find((p) => p.id === trigger.positionId);
    const price = trigger.fillAt ?? (pos && quote ? closePrice(pos, quote) : trigger.price);
    return closeOnExit(state, trigger.positionId, trigger.leg, price, ctx);
  }
  const order = state.pendingOrders.find((o) => o.id === trigger.orderId);
  const fill =
    order?.type === 'limit'
      ? { price: order.triggerPrice, isMaker: true }
      : {
          price: trigger.fillAt ?? (order && quote ? bookPrice(order.side, quote) : trigger.price),
          isMaker: false,
        };
  return order?.category === 'spot'
    ? fillSpotPending(state, trigger.orderId, fill, ctx)
    : fillPending(state, trigger.orderId, fill, ctx);
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
  const byCoin = new Map<string, SpotHolding>(
    delta.reset ? [] : state.spot.map((h) => [h.coin, h])
  );
  for (const h of delta.spotUpsert) byCoin.set(h.coin, h);
  return {
    balance: delta.account.balance,
    realizedPnl: delta.account.realizedPnl,
    leverage: delta.account.leverage,
    symbolLeverage: delta.account.symbolLeverage,
    symbolFundingAt: delta.account.symbolFundingAt,
    // A reset's own time is only known to the DB (Account.lastReset); the next load reads it
    ...(state.resetAt !== undefined && !delta.reset ? { resetAt: state.resetAt } : {}),
    spot: [...byCoin.values()],
    positions: upsert(state.positions, delta.positionsRemove, delta.positionsUpsert),
    pendingOrders: upsert(state.pendingOrders, delta.pendingRemove, delta.pendingUpsert),
  };
}
