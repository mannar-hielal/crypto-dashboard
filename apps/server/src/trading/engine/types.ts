/**
 * Paper-trading engine types (BYBIT_PARITY_PLAN BP-1).
 *
 * Server-side port of the browser engine that lived in apps/client/src/store/paperStore.ts.
 * Money and quantities are Decimal; times are Unix ms. Everything in engine/ is pure: no
 * Prisma client, no I/O, no clock, no randomness. The caller supplies `now` and `newId`.
 */

import type { Decimal } from '@prisma/client/runtime/client';

// ─── Constants (unchanged from the browser engine — BP-2 replaces the fee model) ─

export const STARTING_BALANCE = 10_000;
/** Flat 0.07% taker fee, charged on margin at open and on notional at close. */
export const COMMISSION_RATE = '0.0007';
export const MAX_LEVERAGE = 10;
/** Snapshot sizes the client keeps (paperStore MAX_HISTORY / MAX_JOURNAL). */
export const MAX_HISTORY = 100;
export const MAX_ORDERS = 200;
export const MAX_BALANCE_EVENTS = 200;
export const MAX_JOURNAL = 200;
export const REJECT_NOT_ENOUGH_FUNDS = 'Not enough funds to complete the order.';
export const REJECT_FILL_FAILED = 'Order could not be filled.';

// ─── State ─────────────────────────────────────────────────────────────────────

export type PositionSide = 'long' | 'short';
export type OrderSide = 'buy' | 'sell';
export type PendingType = 'limit' | 'stop';
export type OrderType = 'market' | 'limit' | 'stop' | 'take-profit' | 'stop-loss';
export type OrderStatus = 'filled' | 'cancelled' | 'rejected';
export type ExitLeg = 'take-profit' | 'stop-loss';

export interface Position {
  id: string;
  symbol: string;
  side: PositionSide;
  quantity: Decimal;
  entryPrice: Decimal;
  /** Margin reserved at entry (what was deducted from balance) */
  entryUsdtAmount: Decimal;
  openedAt: number;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
}

export interface PendingOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  type: PendingType;
  /** Margin reserved at placement (plus its commission) */
  usdtAmount: Decimal;
  triggerPrice: Decimal;
  /** Leveraged base qty at placement: usdtAmount × leverage / triggerPrice */
  qty: Decimal;
  /** Leverage at placement — the fill uses it (BP-1 S2) */
  leverage: number;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
  placedAt: number;
}

/** What the engine needs to decide an action for one account. */
export interface AccountState {
  balance: Decimal;
  realizedPnl: Decimal;
  leverage: number;
  positions: Position[];
  pendingOrders: PendingOrder[];
}

// ─── Records the engine writes ─────────────────────────────────────────────────

export interface HistoricalOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: Decimal;
  limitPrice?: Decimal;
  stopPrice?: Decimal;
  fillPrice?: Decimal;
  status: OrderStatus;
  commission: Decimal;
  /** Margin for entry orders; omitted for closing / cancel rows */
  margin?: Decimal;
  leverage?: number;
  placingTime: number;
  closingTime: number;
  rejectionReason?: string;
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  side: PositionSide;
  quantity: Decimal;
  entryPrice: Decimal;
  exitPrice: Decimal;
  /** Gross PnL (price move only) — what the History tab shows */
  pnl: Decimal;
  /** Exit commission and the closed margin, for the Trade row (net pnl, pnlPercent) */
  exitCommission: Decimal;
  margin: Decimal;
  openedAt: number;
  closedAt: number;
}

export interface BalanceEvent {
  id: string;
  time: number;
  balanceBefore: Decimal;
  balanceAfter: Decimal;
  pnl: Decimal;
  action: string;
}

export interface JournalEntry {
  id: string;
  time: number;
  text: string;
  isUserNote: boolean;
  /** Net realized PnL on close entries */
  pnl?: Decimal;
}

// ─── Delta ─────────────────────────────────────────────────────────────────────

/**
 * Everything one action changed. The repository applies it in one transaction; the same
 * delta (serialized) is pushed to the user's open tabs.
 *
 * List fields are in **display order**, with index 0 at the top of its list (newest first),
 * matching how the browser engine prepended them.
 */
export interface Delta {
  account: { balance: Decimal; realizedPnl: Decimal; leverage: number };
  positionsUpsert: Position[];
  positionsRemove: string[];
  pendingUpsert: PendingOrder[];
  pendingRemove: string[];
  orders: HistoricalOrder[];
  trades: ClosedTrade[];
  balanceEvents: BalanceEvent[];
  journal: JournalEntry[];
  journalEdits: { id: string; text: string }[];
  /** Account reset: everything else is wiped first */
  reset?: boolean;
}

export type Sound = 'placed' | 'queued' | 'filled' | 'profit' | 'loss';

export interface ActionResult<R> {
  delta: Delta;
  result: R;
  /** Sound every open tab plays for this change */
  sound?: Sound;
}

/** Injected by the caller so the engine stays deterministic. */
export interface EngineContext {
  now: number;
  /** A unique id fragment (the browser used `${Date.now()}-${random5}`) */
  newId: () => string;
}
