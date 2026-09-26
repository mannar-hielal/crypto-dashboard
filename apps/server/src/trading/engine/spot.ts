/**
 * Spot trading (BYBIT_PARITY_PLAN BP-2) — pure, like actions.ts.
 *
 * One USDT wallet (`AccountState.balance`, D8) plus a coin balance per asset (`spot`). Spot is 1×
 * and long-only: a sell needs the coin (no shorting, F8).
 *
 * - Fees: Bybit spot 0.1%, taken in the asset received — a buy pays in the coin, a sell in USDT.
 * - Prices: market buys fill at the ask, sells at the bid. A resting limit fills at its own price
 *   (maker); a limit that crosses the book fills now at the ask / bid (taker).
 * - Reserves: a resting buy takes qty × limit USDT; a resting sell locks the coin.
 * - TP / SL: attached to a buy, they become two conditional sells once it fills (an OCO pair)
 *   sharing one lock on the bought coin. They trigger on the last price and sell at the bid; the
 *   first to fire cancels the other. They can also be placed on coins already held.
 * - PnL: measured against the holding's average cost (fees included). Each sell writes a closed
 *   trade, so spot results show in the History tab and in realized PnL like perpetual closes.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { REJECT_PRICE_TICK, checkOrderSize, feeRate, isOnTick } from '../bybitSpec.js';
import {
  Draft,
  ZERO,
  baseCoin,
  bookPrice,
  cancelledLegRow,
  crossesBook,
  positive,
  refused,
  resolveQty,
  triggerPriceField,
  type OrderSize,
} from './draft.js';
import { fmtPrice, pendingTypeLabel } from './format.js';
import { systemEntry } from './journal.js';
import {
  type AccountState,
  type ActionResult,
  type EngineContext,
  type ExitLeg,
  type HistoricalOrder,
  type InstrumentRules,
  type OrderSide,
  type PendingOrder,
  type Quote,
} from './types.js';

const RATE = feeRate('spot', 'taker'); // maker and taker are both 0.1% on spot
/** Balances are stored with 8 decimals (Decimal(20, 8)) — amounts are kept on that grid */
const DP = 8;

const sideLabel = (side: OrderSide) => (side === 'buy' ? 'Buy' : 'Sell');

/** Bybit spot 170131 "Balance insufficient", with what is available. */
export const REJECT_SPOT_BALANCE = (available: Decimal, asset: string) =>
  `Balance insufficient (${available.toFixed(asset === 'USDT' ? 2 : 6)} ${asset} available)`;

export const REJECT_TP_BELOW = 'Take-profit must be above the current price';
export const REJECT_SL_ABOVE = 'Stop-loss must be below the current price';

// ─── Fills ─────────────────────────────────────────────────────────────────────

interface SpotFill {
  symbol: string;
  qty: Decimal;
  price: Decimal;
  isMaker: boolean;
}

interface SpotFillOptions {
  /** The resting order this fill executes (its id and type go on the history row) */
  fromPending?: PendingOrder;
  /** A limit that crossed the book when placed: recorded as that limit order */
  crossingLimit?: Decimal;
  /** TP / SL to attach to what a buy receives */
  takeProfit?: Decimal;
  stopLoss?: Decimal;
  /** Journal reason for a TP / SL sell */
  reason?: string;
}

function historyRow(
  side: OrderSide,
  fill: SpotFill,
  fee: Decimal,
  feeAsset: string,
  ctx: EngineContext,
  opts: SpotFillOptions
): HistoricalOrder {
  const base = {
    category: 'spot' as const,
    symbol: fill.symbol,
    side,
    qty: fill.qty,
    fillPrice: fill.price,
    status: 'filled' as const,
    commission: fee,
    feeRate: RATE,
    feeAsset,
    isMaker: fill.isMaker,
    closingTime: ctx.now,
  };
  const order = opts.fromPending;
  if (order) {
    return {
      ...base,
      id: `o-${order.id}`,
      type: order.type,
      ...triggerPriceField(order.type, order.triggerPrice),
      placingTime: order.placedAt,
    };
  }
  if (opts.crossingLimit) {
    return {
      ...base,
      id: `o-${ctx.newId()}`,
      type: 'limit',
      limitPrice: opts.crossingLimit,
      placingTime: ctx.now,
    };
  }
  return { ...base, id: `o-${ctx.newId()}`, type: 'market', placingTime: ctx.now };
}

/**
 * Buy `qty` at `price`, paying qty × price USDT (the caller has checked the funds, or released a
 * reserve that covers it). The 0.1% fee is taken from the coins received.
 */
function buyInto(d: Draft, fill: SpotFill, ctx: EngineContext, opts: SpotFillOptions = {}): string {
  const coin = baseCoin(fill.symbol);
  const cost = fill.qty.times(fill.price);
  // Rounded up onto the stored 8-decimal grid, so what's credited is exactly what's stored
  const fee = fill.qty.times(RATE).toDecimalPlaces(DP, Decimal.ROUND_UP);
  const received = fill.qty.minus(fee);
  const h = d.holding(coin);
  const held = h.free.plus(h.locked);
  const avgCost = held
    .times(h.avgCost)
    .plus(cost)
    .div(held.plus(received))
    .toDecimalPlaces(DP, Decimal.ROUND_HALF_UP);
  d.setHolding({ ...h, free: h.free.plus(received), avgCost });

  const row = historyRow('buy', fill, fee, coin, ctx, opts);
  d.prependOrders(row);
  d.prependBalanceEvent({
    id: `bl-${row.id}`,
    time: ctx.now,
    balanceBefore: d.balance,
    balanceAfter: d.balance.minus(cost),
    pnl: ZERO,
    action: `Spot buy ${received.toFixed(6)} ${coin} at price ${fill.price.toFixed(4)}`,
  });
  d.prependJournal(
    systemEntry(
      `j-${row.id}-buy`,
      ctx.now,
      `Spot buy ${fill.symbol} @ $${fmtPrice(fill.price)} (qty: ${fill.qty.toFixed(6)}, ` +
        `fee: ${fee.toFixed(8)} ${coin})`
    )
  );
  d.balance = d.balance.minus(cost);

  const tp = positive(opts.takeProfit);
  const sl = positive(opts.stopLoss);
  if (tp || sl) placeExitsInto(d, fill.symbol, received, tp, sl, ctx);
  return row.id;
}

/**
 * Sell `qty` at `price` from the free balance, or — for a resting sell / TP / SL — from the lock
 * it already holds. The 0.1% fee is taken from the USDT received. Returns the gross PnL.
 */
function sellInto(
  d: Draft,
  fill: SpotFill,
  from: 'free' | 'locked',
  ctx: EngineContext,
  opts: SpotFillOptions = {}
): Decimal {
  const coin = baseCoin(fill.symbol);
  const h = d.holding(coin);
  // On the stored 8-decimal grid, rounded in the exchange's favour
  const proceeds = fill.qty.times(fill.price).toDecimalPlaces(DP, Decimal.ROUND_DOWN);
  const fee = proceeds.times(RATE).toDecimalPlaces(DP, Decimal.ROUND_UP);
  const pnl = fill.price.minus(h.avgCost).times(fill.qty);
  const netPnl = pnl.minus(fee);
  const free = from === 'free' ? h.free.minus(fill.qty) : h.free;
  const locked = from === 'locked' ? h.locked.minus(fill.qty) : h.locked;
  const empty = free.plus(locked).lte(0);
  d.setHolding({ ...h, free, locked, avgCost: empty ? ZERO : h.avgCost });

  const row = historyRow('sell', fill, fee, 'USDT', ctx, opts);
  d.prependOrders(row);
  d.prependTrade({
    id: `t-${row.id}`,
    category: 'spot',
    symbol: fill.symbol,
    side: 'long',
    quantity: fill.qty,
    entryPrice: h.avgCost,
    exitPrice: fill.price,
    pnl,
    exitCommission: fee,
    margin: h.avgCost.times(fill.qty),
    openedAt: ctx.now,
    closedAt: ctx.now,
  });
  d.prependBalanceEvent({
    id: `bl-${row.id}`,
    time: ctx.now,
    balanceBefore: d.balance,
    balanceAfter: d.balance.plus(proceeds).minus(fee),
    pnl: netPnl,
    action: `Spot sell ${fill.qty.toFixed(6)} ${coin} at price ${fill.price.toFixed(4)}`,
  });
  d.prependJournal(
    systemEntry(
      `j-${row.id}-sell`,
      ctx.now,
      opts.reason ??
        `Spot sell ${fill.symbol} @ $${fmtPrice(fill.price)} (qty: ${fill.qty.toFixed(6)})`,
      netPnl
    )
  );
  d.balance = d.balance.plus(proceeds).minus(fee);
  d.realizedPnl = d.realizedPnl.plus(netPnl);
  return pnl;
}

// ─── TP / SL legs (OCO) ────────────────────────────────────────────────────────

/** Lock `qty` of the coin and place its TP and / or SL as conditional sells sharing that lock. */
function placeExitsInto(
  d: Draft,
  symbol: string,
  qty: Decimal,
  tp: Decimal | undefined,
  sl: Decimal | undefined,
  ctx: EngineContext
): void {
  const coin = baseCoin(symbol);
  const h = d.holding(coin);
  d.setHolding({ ...h, free: h.free.minus(qty), locked: h.locked.plus(qty) });
  const group = ctx.newId();
  const leg = (type: ExitLeg, price: Decimal) => {
    d.setPending({
      id: `${group}-${type === 'take-profit' ? 'tp' : 'sl'}`,
      category: 'spot',
      symbol,
      side: 'sell',
      type,
      usdtAmount: qty.times(price),
      reserved: qty,
      triggerPrice: price,
      qty,
      leverage: 1,
      placedAt: ctx.now,
      ocoGroup: group,
    });
    d.prependJournal(
      systemEntry(
        `j-place-${type}-${group}`,
        ctx.now,
        `${type === 'take-profit' ? 'Take-Profit' : 'Stop-Loss'} order placed — Sell ${symbol} ` +
          `@ $${fmtPrice(price)} (qty: ${qty.toFixed(6)})`
      )
    );
  };
  // TP first: when one backfilled candle spans both, TP wins — the same rule as a perpetual position
  if (tp) leg('take-profit', tp);
  if (sl) leg('stop-loss', sl);
}

/** The other leg of a spot TP / SL pair, if still resting. */
function siblingOf(d: Draft, order: PendingOrder): PendingOrder | undefined {
  if (!order.ocoGroup) return undefined;
  return d.pending.find((o) => o.ocoGroup === order.ocoGroup && o.id !== order.id);
}

/** Refuses a TP at / below, or an SL at / above, the current price (it would fire at once). */
function exitPriceProblem(
  tp: Decimal | undefined,
  sl: Decimal | undefined,
  quote: Quote,
  rules: InstrumentRules
): string | null {
  for (const price of [tp, sl]) {
    if (price && !isOnTick(price, rules.tickSize)) return REJECT_PRICE_TICK(rules.tickSize);
  }
  if (tp && tp.lte(quote.last)) return REJECT_TP_BELOW;
  if (sl && sl.gte(quote.last)) return REJECT_SL_ABOVE;
  return null;
}

// ─── Intents ───────────────────────────────────────────────────────────────────

export interface SpotMarketIntent {
  symbol: string;
  side: OrderSide;
  size: OrderSize;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
}

/** Spot market order at the ask (buy) / bid (sell). Result: the order id, or null. */
export function placeSpotMarket(
  state: AccountState,
  intent: SpotMarketIntent,
  quote: Quote,
  rules: InstrumentRules,
  ctx: EngineContext
): ActionResult<string | null> {
  const { symbol, side } = intent;
  const price = bookPrice(side, quote);
  const qty = resolveQty(intent.size, price, 1, rules);
  const invalid = checkOrderSize('spot', rules, qty, price);
  if (invalid) return refused(state, null, invalid);

  const d = new Draft(state);
  const coin = baseCoin(symbol);
  if (side === 'sell') {
    // F8: spot never goes short — only coins you hold (and haven't locked) can be sold
    const free = d.holding(coin).free;
    if (qty.gt(free)) return refused(state, null, REJECT_SPOT_BALANCE(free, coin));
    const pnl = sellInto(d, { symbol, qty, price, isMaker: false }, 'free', ctx);
    return { delta: d.toDelta(), result: d.orders[0].id, sound: pnl.gte(0) ? 'profit' : 'loss' };
  }

  const tp = positive(intent.takeProfit);
  const sl = positive(intent.stopLoss);
  const exitProblem = exitPriceProblem(tp, sl, quote, rules);
  if (exitProblem) return refused(state, null, exitProblem);
  if (qty.times(price).gt(d.balance)) {
    return refused(state, null, REJECT_SPOT_BALANCE(d.balance, 'USDT'));
  }
  const id = buyInto(d, { symbol, qty, price, isMaker: false }, ctx, {
    takeProfit: tp,
    stopLoss: sl,
  });
  return { delta: d.toDelta(), result: id, sound: 'placed' };
}

export interface SpotLimitIntent {
  symbol: string;
  side: OrderSide;
  triggerPrice: Decimal;
  size: OrderSize;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
}

/**
 * Spot limit order. One that crosses the book fills now as a taker; otherwise it rests, taking
 * qty × limit USDT (buy) or locking the coin (sell). Result: the order id, or null.
 */
export function placeSpotLimit(
  state: AccountState,
  intent: SpotLimitIntent,
  quote: Quote,
  rules: InstrumentRules,
  ctx: EngineContext
): ActionResult<string | null> {
  const { symbol, side, triggerPrice: limit } = intent;
  if (limit.lte(0)) return refused(state, null, 'Limit price must be positive');
  if (!isOnTick(limit, rules.tickSize))
    return refused(state, null, REJECT_PRICE_TICK(rules.tickSize));
  const qty = resolveQty(intent.size, limit, 1, rules);
  const invalid = checkOrderSize('spot', rules, qty, limit);
  if (invalid) return refused(state, null, invalid);

  const coin = baseCoin(symbol);
  const tp = side === 'buy' ? positive(intent.takeProfit) : undefined;
  const sl = side === 'buy' ? positive(intent.stopLoss) : undefined;
  const d = new Draft(state);
  const free = d.holding(coin).free;
  if (side === 'sell' && qty.gt(free)) return refused(state, null, REJECT_SPOT_BALANCE(free, coin));

  if (crossesBook(side, limit, quote)) {
    const fill = { symbol, qty, price: bookPrice(side, quote), isMaker: false };
    // It trades now at the ask, so that's what it costs — not qty × the (higher) limit
    if (side === 'buy' && qty.times(fill.price).gt(d.balance)) {
      return refused(state, null, REJECT_SPOT_BALANCE(d.balance, 'USDT'));
    }
    if (side === 'sell') {
      const pnl = sellInto(d, fill, 'free', ctx, { crossingLimit: limit });
      return { delta: d.toDelta(), result: d.orders[0].id, sound: pnl.gte(0) ? 'profit' : 'loss' };
    }
    const exitProblem = exitPriceProblem(tp, sl, quote, rules);
    if (exitProblem) return refused(state, null, exitProblem);
    const id = buyInto(d, fill, ctx, { crossingLimit: limit, takeProfit: tp, stopLoss: sl });
    return { delta: d.toDelta(), result: id, sound: 'placed' };
  }

  // A resting buy takes qty × limit USDT
  if (side === 'buy' && qty.times(limit).gt(d.balance)) {
    return refused(state, null, REJECT_SPOT_BALANCE(d.balance, 'USDT'));
  }

  // TP / SL of a resting buy are checked against its limit (they attach once it fills)
  for (const price of [tp, sl]) {
    if (price && !isOnTick(price, rules.tickSize)) {
      return refused(state, null, REJECT_PRICE_TICK(rules.tickSize));
    }
  }
  if (tp && tp.lte(limit)) return refused(state, null, REJECT_TP_BELOW);
  if (sl && sl.gte(limit)) return refused(state, null, REJECT_SL_ABOVE);

  const id = ctx.newId();
  const reserved = side === 'buy' ? qty.times(limit) : qty;
  d.setPending({
    id,
    category: 'spot',
    symbol,
    side,
    type: 'limit',
    usdtAmount: qty.times(limit),
    reserved,
    triggerPrice: limit,
    qty,
    leverage: 1,
    placedAt: ctx.now,
    ...(tp ? { takeProfit: tp } : {}),
    ...(sl ? { stopLoss: sl } : {}),
  });
  if (side === 'buy') {
    d.balance = d.balance.minus(reserved);
  } else {
    const h = d.holding(coin);
    d.setHolding({ ...h, free: h.free.minus(qty), locked: h.locked.plus(qty) });
  }
  d.prependJournal(
    systemEntry(
      `j-place-limit-${id}`,
      ctx.now,
      `Placed LIMIT ${sideLabel(side)} ${symbol} @ $${fmtPrice(limit)} (Spot, qty: ${qty.toFixed(6)}, ` +
        (side === 'buy'
          ? `reserved: $${reserved.toFixed(2)})`
          : `locked: ${qty.toFixed(6)} ${coin})`)
    )
  );
  return { delta: d.toDelta(), result: id, sound: 'queued' };
}

export interface SpotExitsIntent {
  symbol: string;
  qty: Decimal;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
}

/** TP / SL on coins already held: locks `qty` of the free balance behind an OCO pair. */
export function placeSpotExits(
  state: AccountState,
  intent: SpotExitsIntent,
  quote: Quote,
  rules: InstrumentRules,
  ctx: EngineContext
): ActionResult<string | null> {
  const tp = positive(intent.takeProfit);
  const sl = positive(intent.stopLoss);
  if (!tp && !sl) return refused(state, null, 'Set a take-profit, a stop-loss or both');
  const qty = resolveQty({ qty: intent.qty }, quote.last, 1, rules);
  const invalid = checkOrderSize('spot', rules, qty, sl ?? tp ?? quote.last);
  if (invalid) return refused(state, null, invalid);
  const exitProblem = exitPriceProblem(tp, sl, quote, rules);
  if (exitProblem) return refused(state, null, exitProblem);
  const coin = baseCoin(intent.symbol);
  const d = new Draft(state);
  const free = d.holding(coin).free;
  if (qty.gt(free)) return refused(state, null, REJECT_SPOT_BALANCE(free, coin));
  placeExitsInto(d, intent.symbol, qty, tp, sl, ctx);
  return {
    delta: d.toDelta(),
    result: d.pending[d.pending.length - 1].ocoGroup ?? null,
    sound: 'queued',
  };
}

// ─── Cancel / fill ─────────────────────────────────────────────────────────────

/**
 * Cancel a resting spot order: a buy refunds its USDT, a sell releases its coins. A TP / SL leg
 * releases the shared lock only when its sibling is gone too.
 */
export function cancelSpotPending(
  state: AccountState,
  orderId: string,
  ctx: EngineContext
): ActionResult<boolean> {
  const d = new Draft(state);
  const order = d.pending.find((o) => o.id === orderId && o.category === 'spot');
  if (!order) return { delta: d.toDelta(), result: false };
  const now = ctx.now;
  const coin = baseCoin(order.symbol);

  let refund: string;
  if (order.side === 'buy') {
    d.balance = d.balance.plus(order.reserved);
    refund = `refunded: $${order.reserved.toFixed(2)}`;
  } else if (siblingOf(d, order)) {
    refund = 'lock kept by the other leg';
  } else {
    const h = d.holding(coin);
    d.setHolding({
      ...h,
      free: h.free.plus(order.reserved),
      locked: h.locked.minus(order.reserved),
    });
    refund = `released: ${order.reserved.toFixed(6)} ${coin}`;
  }

  const row =
    order.type === 'take-profit' || order.type === 'stop-loss'
      ? cancelledLegRow(
          `o-cancel-${orderId}`,
          order.type,
          order.symbol,
          'sell',
          order.qty,
          order.triggerPrice,
          order.placedAt,
          now,
          'spot'
        )
      : {
          id: `o-cancel-${orderId}`,
          category: 'spot' as const,
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          qty: order.qty,
          ...triggerPriceField(order.type, order.triggerPrice),
          status: 'cancelled' as const,
          commission: ZERO,
          placingTime: order.placedAt,
          closingTime: now,
        };
  const legRows: HistoricalOrder[] = [];
  for (const [leg, price] of [
    ['take-profit', order.takeProfit],
    ['stop-loss', order.stopLoss],
  ] as const) {
    if (price) {
      legRows.push(
        cancelledLegRow(
          `o-cancel-${leg === 'take-profit' ? 'tp' : 'sl'}-${orderId}`,
          leg,
          order.symbol,
          'sell',
          order.qty,
          price,
          order.placedAt,
          now,
          'spot'
        )
      );
    }
  }
  d.prependOrders(row, ...legRows);
  d.prependJournal(
    systemEntry(
      `j-cancel-pending-${orderId}-${now}`,
      now,
      `Cancelled ${pendingTypeLabel(order.type)} ${sideLabel(order.side)} ${order.symbol} ` +
        `@ $${fmtPrice(order.triggerPrice)} (Spot, ${refund})`
    )
  );
  d.removePending(orderId);
  return { delta: d.toDelta(), result: true };
}

/**
 * Execute a triggered spot order at `fill.price`: a limit buy spends its reserve, a limit sell /
 * TP / SL sells its locked coins. A TP / SL fill cancels its sibling (the lock is used up).
 */
export function fillSpotPending(
  state: AccountState,
  orderId: string,
  fill: { price: Decimal; isMaker: boolean },
  ctx: EngineContext
): ActionResult<string | null> {
  const d = new Draft(state);
  const order = d.pending.find((o) => o.id === orderId && o.category === 'spot');
  if (!order) return { delta: d.toDelta(), result: null };
  d.removePending(orderId);
  const spec = { symbol: order.symbol, qty: order.qty, price: fill.price, isMaker: fill.isMaker };

  if (order.side === 'buy') {
    d.balance = d.balance.plus(order.reserved);
    const id = buyInto(d, spec, ctx, {
      fromPending: order,
      takeProfit: order.takeProfit,
      stopLoss: order.stopLoss,
    });
    d.prependJournal(
      systemEntry(
        `j-note-${ctx.newId()}`,
        ctx.now,
        `Limit order filled — Buy ${order.symbol} @ $${fmtPrice(fill.price)} (Spot, qty: ${order.qty.toFixed(6)})`
      )
    );
    return { delta: d.toDelta(), result: id, sound: 'filled' };
  }

  const sibling = siblingOf(d, order);
  if (sibling) {
    d.removePending(sibling.id);
    d.prependOrders(
      cancelledLegRow(
        `o-cancel-${sibling.id}`,
        sibling.type as ExitLeg,
        sibling.symbol,
        'sell',
        sibling.qty,
        sibling.triggerPrice,
        sibling.placedAt,
        ctx.now,
        'spot'
      )
    );
  }
  const isExit = order.type === 'take-profit' || order.type === 'stop-loss';
  const reason = isExit
    ? `Auto-sold ${order.symbol} — ${order.type === 'take-profit' ? 'Take-Profit' : 'Stop-Loss'} ` +
      `hit at $${fmtPrice(fill.price)} (Spot, qty: ${order.qty.toFixed(6)})`
    : undefined;
  const pnl = sellInto(d, spec, 'locked', ctx, { fromPending: order, reason });
  return {
    delta: d.toDelta(),
    result: d.orders.find((o) => o.id === `o-${order.id}`)?.id ?? null,
    sound: isExit ? (pnl.gte(0) ? 'profit' : 'loss') : 'filled',
  };
}

// ─── Edit ──────────────────────────────────────────────────────────────────────

export interface SpotLimitEdit {
  triggerPrice: Decimal;
  size: OrderSize;
  takeProfit: Decimal | null;
  stopLoss: Decimal | null;
}

/**
 * Edit a resting spot limit (price, size, and a buy's TP / SL). Its old reserve is released and
 * the new one taken; moved across the book it fills now as a taker. TP / SL legs are cancelled and
 * placed again rather than edited. Result: 'ok' | 'not-found' (refusals set `invalid`).
 */
export function editSpotLimit(
  state: AccountState,
  orderId: string,
  edit: SpotLimitEdit,
  quote: Quote,
  rules: InstrumentRules,
  ctx: EngineContext
): ActionResult<'ok' | 'rejected' | 'not-found'> {
  const order = state.pendingOrders.find((o) => o.id === orderId && o.category === 'spot');
  if (!order) return { delta: new Draft(state).toDelta(), result: 'not-found' };
  if (order.type !== 'limit') {
    return refused(state, 'rejected', 'Cancel this TP / SL order and place a new one to change it');
  }
  // Re-place it on the account as it would be with this order's reserve released. The resulting
  // delta carries absolute balances, so it applies to the real account as it stands.
  const d = new Draft(state);
  const coin = baseCoin(order.symbol);
  if (order.side === 'buy') {
    d.balance = d.balance.plus(order.reserved);
  } else {
    const h = d.holding(coin);
    d.setHolding({
      ...h,
      free: h.free.plus(order.reserved),
      locked: h.locked.minus(order.reserved),
    });
  }
  const released: AccountState = {
    ...state,
    balance: d.balance,
    spot: [...state.spot.filter((h) => h.coin !== coin), d.holding(coin)],
    pendingOrders: state.pendingOrders.filter((o) => o.id !== orderId),
  };

  const placed = placeSpotLimit(
    released,
    {
      symbol: order.symbol,
      side: order.side,
      triggerPrice: edit.triggerPrice,
      size: edit.size,
      takeProfit: edit.takeProfit ?? undefined,
      stopLoss: edit.stopLoss ?? undefined,
    },
    quote,
    rules,
    ctx
  );
  if (placed.invalid) return refused(state, 'rejected', placed.invalid);

  // Same order, new terms: keep its id and placement time on the resting row
  const renamed = placed.delta.pendingUpsert.map((o) =>
    o.id === placed.result ? { ...o, id: orderId, placedAt: order.placedAt } : o
  );
  const filledNow = renamed.every((o) => o.id !== orderId);
  const journal = placed.delta.journal.map((j) =>
    j.id === `j-place-limit-${placed.result}`
      ? {
          ...j,
          id: `j-edit-pending-summary-${orderId}-${ctx.now}`,
          text: j.text.replace(/^Placed /, 'Modified '),
        }
      : j
  );
  return {
    delta: {
      ...placed.delta,
      pendingUpsert: renamed,
      pendingRemove: filledNow ? [orderId] : [],
      journal,
    },
    result: 'ok',
    ...(filledNow ? { sound: placed.sound } : {}),
  };
}
