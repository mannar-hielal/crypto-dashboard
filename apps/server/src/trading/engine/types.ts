/**
 * Paper-trading engine types (BYBIT_PARITY_PLAN BP-1, BP-2).
 *
 * Money and quantities are Decimal; times are Unix ms. Everything in engine/ is pure: no
 * Prisma client, no I/O, no clock, no randomness. The caller supplies `now`, `newId`, the live
 * quote and the instrument rules.
 */

import type { Decimal } from '@prisma/client/runtime/client';

// ─── Constants ─────────────────────────────────────────────────────────────────
// Fee rates live in ../bybitSpec.ts (Bybit VIP-0, BP-2) — BP-1's flat COMMISSION_RATE is gone.

export const STARTING_BALANCE = 10_000;
export const MAX_LEVERAGE = 10;
/** Snapshot sizes the client keeps (paperStore MAX_HISTORY / MAX_JOURNAL). */
export const MAX_HISTORY = 100;
export const MAX_ORDERS = 200;
export const MAX_BALANCE_EVENTS = 200;
export const MAX_JOURNAL = 200;
export const REJECT_NOT_ENOUGH_FUNDS = 'Not enough funds to complete the order.';
export const REJECT_FILL_FAILED = 'Order could not be filled.';

// ─── Markets ───────────────────────────────────────────────────────────────────

/** 'spot' = Spot, 'linear' = USDT Perpetual (Bybit's API category names). */
export type Category = 'spot' | 'linear';

/** Live best bid / ask and last price for one symbol in one category. */
export interface Quote {
  last: Decimal;
  bid: Decimal;
  ask: Decimal;
}

/** Bybit instrument rules the engine enforces (instruments-info). 0 = no constraint. */
export interface InstrumentRules {
  tickSize: Decimal;
  qtyStep: Decimal;
  minOrderQty: Decimal;
  minNotional: Decimal;
}

// ─── State ─────────────────────────────────────────────────────────────────────

export type PositionSide = 'long' | 'short';
export type OrderSide = 'buy' | 'sell';
/**
 * limit / stop: entry orders. take-profit / stop-loss: spot conditional sells that protect a coin
 * holding (an OCO pair sharing one coin lock). A USDT Perpetual position keeps its TP / SL on the
 * position instead.
 */
export type PendingType = 'limit' | 'stop' | 'take-profit' | 'stop-loss';
export type OrderType = 'market' | 'limit' | 'stop' | 'take-profit' | 'stop-loss';
export type OrderStatus = 'filled' | 'cancelled' | 'rejected';
export type ExitLeg = 'take-profit' | 'stop-loss';

/** A USDT Perpetual position (spot holds coin balances, not positions). */
export interface Position {
  id: string;
  category: 'linear';
  symbol: string;
  side: PositionSide;
  quantity: Decimal;
  entryPrice: Decimal;
  /** Initial margin: quantity × entryPrice / leverage */
  entryUsdtAmount: Decimal;
  leverage: number;
  /** Open fee actually charged — a close subtracts this from realized PnL, never a recomputation */
  entryFee: Decimal;
  /**
   * Estimated close fee held with the margin at open (Bybit's position margin = IM + this).
   * 0 on pre-BP-2 positions, which reserved none.
   */
  closeFeeReserve: Decimal;
  openedAt: number;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
}

export interface PendingOrder {
  id: string;
  category: Category;
  symbol: string;
  side: OrderSide;
  type: PendingType;
  /** Initial margin at the trigger price: qty × triggerPrice / leverage */
  usdtAmount: Decimal;
  /**
   * Exactly what placing it set aside, refunded on cancel / edit / fill. USDT Perpetual: IM +
   * estimated open and close fees (USDT). Spot buy: qty × limit (USDT). Spot sell / TP / SL: the
   * coin quantity locked.
   */
  reserved: Decimal;
  /** Spot TP / SL pair: both legs share one coin lock; filling one cancels the other */
  ocoGroup?: string;
  triggerPrice: Decimal;
  /** Leveraged base qty at placement: usdtAmount × leverage / triggerPrice */
  qty: Decimal;
  /** Leverage at placement — the fill uses it (BP-1 S2) */
  leverage: number;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
  placedAt: number;
}

/** A spot coin balance. `free` can be sold; `locked` backs resting sell / TP / SL orders. */
export interface SpotHolding {
  coin: string;
  free: Decimal;
  locked: Decimal;
  /** Average cost per coin in USDT, fees included — spot PnL is measured against it */
  avgCost: Decimal;
}

/** What the engine needs to decide an action for one account. */
export interface AccountState {
  balance: Decimal;
  realizedPnl: Decimal;
  /** Default leverage for a symbol with no per-symbol setting */
  leverage: number;
  /** USDT Perpetual leverage per symbol (BP-2) */
  symbolLeverage: Record<string, number>;
  /** Spot coin balances (the USDT wallet is `balance`) */
  spot: SpotHolding[];
  positions: Position[];
  pendingOrders: PendingOrder[];
}

// ─── Records the engine writes ─────────────────────────────────────────────────

export interface HistoricalOrder {
  id: string;
  category: Category;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: Decimal;
  limitPrice?: Decimal;
  stopPrice?: Decimal;
  fillPrice?: Decimal;
  status: OrderStatus;
  /** Fee charged (0 for cancel / reject rows) */
  commission: Decimal;
  /** Rate, asset and liquidity of the fee — set on fills */
  feeRate?: Decimal;
  feeAsset?: string;
  isMaker?: boolean;
  /** Margin for entry orders; omitted for closing / cancel rows */
  margin?: Decimal;
  leverage?: number;
  placingTime: number;
  closingTime: number;
  rejectionReason?: string;
}

export interface ClosedTrade {
  id: string;
  category: Category;
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
  account: {
    balance: Decimal;
    realizedPnl: Decimal;
    leverage: number;
    symbolLeverage: Record<string, number>;
  };
  positionsUpsert: Position[];
  positionsRemove: string[];
  /** Spot coin balances that changed (a zero balance stays as a zero row) */
  spotUpsert: SpotHolding[];
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
  /**
   * Set when the action was refused before anything changed (Bybit's size / tick rules, a locked
   * setting). The delta is empty; the API answers 422 with this message.
   */
  invalid?: string;
}

/** Injected by the caller so the engine stays deterministic. */
export interface EngineContext {
  now: number;
  /** A unique id fragment (the browser used `${Date.now()}-${random5}`) */
  newId: () => string;
}
