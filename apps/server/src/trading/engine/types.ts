/**
 * Paper-trading engine types (BYBIT_PARITY_PLAN BP-1, BP-2, BP-3, BP-4).
 *
 * Money and quantities are Decimal; times are Unix ms. Everything in engine/ is pure: no
 * Prisma client, no I/O, no clock, no randomness. The caller supplies `now`, `newId`, the live
 * quote and the instrument rules.
 */

import type { Decimal } from '@prisma/client/runtime/client';
import type { RiskTier } from '../bybitSpec.js';

// ─── Constants ─────────────────────────────────────────────────────────────────
// Fee rates live in ../bybitSpec.ts (Bybit VIP-0, BP-2) — BP-1's flat COMMISSION_RATE is gone.

export const STARTING_BALANCE = 10_000;
export const MAX_LEVERAGE = 10;
/** Snapshot sizes the client keeps (paperStore MAX_HISTORY / MAX_JOURNAL). */
export const MAX_HISTORY = 100;
export const MAX_ORDERS = 200;
export const MAX_BALANCE_EVENTS = 200;
export const MAX_JOURNAL = 200;
/** Funding settlements sent with the snapshot (BP-4) */
export const MAX_FUNDINGS = 100;
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
  /** Mark price (USDT Perpetual only) — unrealised PnL and liquidation use it (BP-3) */
  mark?: Decimal;
  /** Index price (USDT Perpetual only) — a TP / SL / stop set to trigger on it uses it (BP-5 B) */
  index?: Decimal;
}

/**
 * The price a USDT Perpetual TP / SL or stop order triggers on — Bybit's `triggerBy` (BP-5 B).
 * Absent = LastPrice, Bybit's default. A limit order always rests on the last price.
 */
export type TriggerBy = 'LastPrice' | 'MarkPrice' | 'IndexPrice';
export const TRIGGER_BY: readonly TriggerBy[] = ['LastPrice', 'MarkPrice', 'IndexPrice'];

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

/**
 * A USDT Perpetual position (spot holds coin balances, not positions). One-way mode (BP-3): at most
 * one position per symbol — a same-side fill is merged into it at the averaged entry price.
 * Liquidation and bankruptcy prices are derived from it (bybitSpec.positionRisk), never stored.
 */
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
  /** Margin added by hand on top of IM (BP-5; absent / 0 until then) */
  extraMargin?: Decimal;
  /** Funding settled on this position so far, signed as Bybit: positive = paid (BP-4) */
  cumFunding?: Decimal;
  openedAt: number;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
  /** What each exit leg triggers on (BP-5 B); absent = LastPrice */
  tpTriggerBy?: TriggerBy;
  slTriggerBy?: TriggerBy;
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
  /** A stop order's trigger source (BP-5 B); absent = LastPrice. Limits always use the last price */
  triggerBy?: TriggerBy;
  /** Trigger source of the TP / SL the fill attaches to the position; absent = LastPrice */
  tpTriggerBy?: TriggerBy;
  slTriggerBy?: TriggerBy;
  /**
   * Reduce-only (BP-5 B): the order can only shrink the opposite position — it reserves nothing,
   * carries no TP / SL, and is trimmed when the position shrinks below the reduce-only quantity
   * resting on it.
   */
  reduceOnly?: boolean;
  /**
   * Close-on-trigger (implies reduce-only). On Bybit it may cancel other orders to free margin for
   * the close; here a close never needs free margin (its fee comes out of the position), so it
   * behaves exactly like reduce-only.
   */
  closeOnTrigger?: boolean;
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
/**
 * Bybit UTA margin mode, account-wide (BP-5 E): 'REGULAR_MARGIN' = cross, 'ISOLATED_MARGIN'.
 * Absent on an engine state = isolated (every account before BP-5, and the engine tests).
 */
export type MarginMode = 'ISOLATED_MARGIN' | 'REGULAR_MARGIN';
export const MARGIN_MODES: readonly MarginMode[] = ['ISOLATED_MARGIN', 'REGULAR_MARGIN'];

export interface AccountState {
  /**
   * USDT not tied up anywhere. In isolated mode it can't go below 0. In cross mode positions and
   * orders still hold their margin here (the bookkeeping is the same), but an order is accepted
   * against the account's available balance — unrealised profit counts — and a loss beyond a
   * position's margin comes out of it, so it can go below 0 while the margin balance is positive.
   */
  balance: Decimal;
  realizedPnl: Decimal;
  /** Default leverage for a symbol with no per-symbol setting */
  leverage: number;
  /** USDT Perpetual leverage per symbol (BP-2) */
  symbolLeverage: Record<string, number>;
  /**
   * Last funding timestamp settled per symbol (Unix ms, BP-4) — a settlement at or before it is a
   * no-op, so a restart, retry or second machine can never charge the same funding twice
   */
  symbolFundingAt: Record<string, number>;
  /**
   * When the account was last reset (Unix ms; its creation time if never). A reset wipes the
   * positions and the funding markers, so a funding timestamp before it must never be charged to
   * the fresh account — the engine may have snapshotted the old positions just before the reset.
   */
  resetAt?: number;
  /** Spot coin balances (the USDT wallet is `balance`) */
  spot: SpotHolding[];
  positions: Position[];
  pendingOrders: PendingOrder[];
  /** Absent = ISOLATED_MARGIN (BP-5 E) */
  marginMode?: MarginMode;
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
  /** Bybit's createType for a system order: 'CreateByLiq' = the liquidation close (BP-3) */
  createType?: 'CreateByLiq';
  /** Bybit's order flags (BP-5 B) — set only when true / not LastPrice */
  reduceOnly?: boolean;
  closeOnTrigger?: boolean;
  triggerBy?: TriggerBy;
}

/** Bybit's execution type: a normal fill, a liquidation at the bankruptcy price (BP-3), funding (BP-4) */
export type ExecType = 'Trade' | 'BustTrade' | 'Funding';

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
  /** Absent = 'Trade' */
  execType?: ExecType;
  /** The closed part's share of the position's funding (signed, + = paid) — Closed P&L nets it (BP-4) */
  funding?: Decimal;
  /**
   * The closed part's share of the open fee (BP-5 D) — with it the row holds every input of
   * Bybit's closedPnl = PnL − open fee − close fee − funding. Absent on spot sells.
   */
  openFee?: Decimal;
}

/**
 * One funding settlement on one position (Bybit execution `execType = Funding`, BP-4): it moves
 * money, never the position.
 */
export interface FundingExecution {
  id: string;
  symbol: string;
  side: PositionSide;
  /** Position size at the funding timestamp */
  qty: Decimal;
  /** Mark price at the funding timestamp */
  markPrice: Decimal;
  /** Settled funding rate */
  rate: Decimal;
  /** qty × mark × rate, signed as Bybit's execFee: positive = paid, negative = received */
  fee: Decimal;
  /** The funding timestamp (Unix ms) */
  time: number;
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
    symbolFundingAt: Record<string, number>;
    /** BP-5 E */
    marginMode: MarginMode;
  };
  positionsUpsert: Position[];
  positionsRemove: string[];
  /** Spot coin balances that changed (a zero balance stays as a zero row) */
  spotUpsert: SpotHolding[];
  pendingUpsert: PendingOrder[];
  pendingRemove: string[];
  orders: HistoricalOrder[];
  trades: ClosedTrade[];
  /** Funding settlements (BP-4) */
  fundings: FundingExecution[];
  /**
   * A funding fee for a position closed between the timestamp and its settlement (BP-5 F): added
   * to that close's Trade row (its funding share, and its net PnL) so Closed P&L includes it, as
   * Bybit's would. Matched by symbol + the position's open time, the latest close after `ts`.
   */
  closedTradeFunding: { symbol: string; openedAt: number; ts: number; funding: Decimal }[];
  balanceEvents: BalanceEvent[];
  journal: JournalEntry[];
  journalEdits: { id: string; text: string }[];
  /** Account reset: everything else is wiped first */
  reset?: boolean;
}

export type Sound = 'placed' | 'queued' | 'filled' | 'profit' | 'loss' | 'liquidation';

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
  /** USDT Perpetual risk-limit tiers of a symbol (BP-3). Default: the bundled Bybit snapshot. */
  riskTiers?: (symbol: string) => RiskTier[];
  /**
   * The fresh USDT Perpetual mark price of a symbol (BP-5 E: cross margin values every position at
   * mark). Absent / undefined for a symbol = its entry price (no unrealised PnL).
   */
  markPrice?: (symbol: string) => Decimal | undefined;
}
