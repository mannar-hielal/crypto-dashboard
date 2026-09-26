/**
 * Shared engine building blocks (BYBIT_PARITY_PLAN BP-2): the Draft working copy every action
 * mutates, order sizing, book prices and the record builders both markets use. USDT Perpetual
 * actions live in actions.ts, spot actions in spot.ts.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { floorToStep } from '../bybitSpec.js';
import {
  MAX_LEVERAGE,
  type AccountState,
  type ActionResult,
  type BalanceEvent,
  type Category,
  type ClosedTrade,
  type Delta,
  type ExitLeg,
  type HistoricalOrder,
  type InstrumentRules,
  type JournalEntry,
  type OrderSide,
  type PendingOrder,
  type PendingType,
  type Position,
  type Quote,
  type SpotHolding,
} from './types.js';

export const ZERO = new Decimal(0);

export function opposite(side: OrderSide): OrderSide {
  return side === 'buy' ? 'sell' : 'buy';
}

/**
 * 🔐 Leverage as the money maths may use it: an integer in [1, MAX_LEVERAGE]. Every write path
 * already clamps; re-clamping where a fill is sized means a bad stored value (manual DB fix,
 * a future import) can never size a position.
 */
export function clampLeverage(value: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? Math.round(value) : 1, 1), MAX_LEVERAGE);
}

/** The leverage a new order on `symbol` uses: its own setting, else the account default. */
export function leverageFor(
  state: Pick<AccountState, 'leverage' | 'symbolLeverage'>,
  symbol: string
): number {
  // symbol is route-validated against ALLOWED_SYMBOLS (or comes from a stored order) — safe access
  // eslint-disable-next-line security/detect-object-injection
  return clampLeverage(state.symbolLeverage[symbol] ?? state.leverage);
}

export function positive(v: Decimal | null | undefined): Decimal | undefined {
  return v && v.gt(0) ? v : undefined;
}

/** The price a taker order on `side` fills at: buys lift the ask, sells hit the bid. */
export function bookPrice(side: OrderSide, quote: Quote): Decimal {
  return side === 'buy' ? quote.ask : quote.bid;
}

/** True when a limit at `price` would trade against the book right now (so it's a taker). */
export function crossesBook(side: OrderSide, price: Decimal, quote: Quote): boolean {
  return side === 'buy' ? price.gte(quote.ask) : price.lte(quote.bid);
}

/** The base coin of a USDT pair (BTCUSDT → BTC). Every allow-listed symbol is a USDT pair. */
export function baseCoin(symbol: string): string {
  return symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
}

// ─── Order size ────────────────────────────────────────────────────────────────

/**
 * How an order's size is given: base-coin quantity, USDT notional value (Bybit's "by value"), or
 * — from a pre-BP-2 client — initial margin in USDT.
 */
export type OrderSize = { qty: Decimal } | { value: Decimal } | { margin: Decimal };

/** Base-coin quantity for `size` at `price`, rounded down to the qty step. */
export function resolveQty(
  size: OrderSize,
  price: Decimal,
  leverage: number,
  rules: InstrumentRules
): Decimal {
  if (price.lte(0)) return ZERO;
  const raw =
    'qty' in size
      ? size.qty
      : 'value' in size
        ? size.value.div(price)
        : size.margin.times(leverage).div(price);
  return floorToStep(raw, rules.qtyStep);
}

// ─── Record builders ───────────────────────────────────────────────────────────

/** A cancelled TP / SL leg row (position legs, pending-order legs, sibling cancels). */
export function cancelledLegRow(
  id: string,
  leg: ExitLeg,
  symbol: string,
  side: OrderSide,
  qty: Decimal,
  price: Decimal,
  placingTime: number,
  closingTime: number,
  category: Category = 'linear'
): HistoricalOrder {
  return {
    id,
    category,
    symbol,
    side,
    type: leg,
    qty,
    ...(leg === 'take-profit' ? { limitPrice: price } : { stopPrice: price }),
    status: 'cancelled',
    commission: ZERO,
    placingTime,
    closingTime,
  };
}

/** Cancelled rows for a pending order's TP and SL legs. */
export function pendingLegCancels(
  order: PendingOrder,
  idPrefix: (leg: 'tp' | 'sl') => string,
  now: number
): HistoricalOrder[] {
  const rows: HistoricalOrder[] = [];
  const side = opposite(order.side);
  const leg = (kind: 'tp' | 'sl', type: ExitLeg, price: Decimal) =>
    cancelledLegRow(
      idPrefix(kind),
      type,
      order.symbol,
      side,
      order.qty,
      price,
      order.placedAt,
      now,
      order.category
    );
  if (order.takeProfit) rows.push(leg('tp', 'take-profit', order.takeProfit));
  if (order.stopLoss) rows.push(leg('sl', 'stop-loss', order.stopLoss));
  return rows;
}

/** The history-row price field of a pending order: a limit's price, else its trigger. */
export function triggerPriceField(type: PendingType, price: Decimal) {
  return type === 'limit' ? { limitPrice: price } : { stopPrice: price };
}

// ─── Draft: a mutable working copy that records what changed ──────────────────

/**
 * Mirrors the browser engine's sequence of zustand `set()` calls: each step reads the balance
 * the previous step left behind (the netting loop depends on that). List records are
 * prepended, exactly as the browser did, so `delta` lists come out newest-first.
 */
export class Draft {
  balance: Decimal;
  realizedPnl: Decimal;
  leverage: number;
  symbolLeverage: Record<string, number>;
  positions: Position[];
  pending: PendingOrder[];
  private spot: Map<string, SpotHolding>;
  readonly orders: HistoricalOrder[] = [];
  readonly trades: ClosedTrade[] = [];
  readonly balanceEvents: BalanceEvent[] = [];
  readonly journal: JournalEntry[] = [];
  readonly journalEdits: { id: string; text: string }[] = [];
  private readonly touchedPositions = new Set<string>();
  private readonly touchedPending = new Set<string>();
  private readonly touchedSpot = new Set<string>();
  private readonly initialPositionIds: Set<string>;
  private readonly initialPendingIds: Set<string>;
  reset = false;

  constructor(state: AccountState) {
    this.balance = state.balance;
    this.realizedPnl = state.realizedPnl;
    this.leverage = clampLeverage(state.leverage);
    this.symbolLeverage = { ...state.symbolLeverage };
    this.positions = [...state.positions];
    this.pending = [...state.pendingOrders];
    this.spot = new Map(state.spot.map((h) => [h.coin, h]));
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

  /** A coin balance (zero when the account never held the coin). */
  holding(coin: string): SpotHolding {
    return this.spot.get(coin) ?? { coin, free: ZERO, locked: ZERO, avgCost: ZERO };
  }
  setHolding(h: SpotHolding): void {
    this.spot.set(h.coin, h);
    this.touchedSpot.add(h.coin);
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
    const spotUpsert: SpotHolding[] = [];
    for (const coin of this.touchedSpot) spotUpsert.push(this.holding(coin));
    return {
      account: {
        balance: this.balance,
        realizedPnl: this.realizedPnl,
        leverage: this.leverage,
        symbolLeverage: this.symbolLeverage,
      },
      positionsUpsert,
      positionsRemove,
      spotUpsert,
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

/** An action that was refused before anything changed (the route answers 422 with `invalid`). */
export function refused<R>(state: AccountState, result: R, invalid: string): ActionResult<R> {
  return { delta: new Draft(state).toDelta(), result, invalid };
}
