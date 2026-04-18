/**
 * Paper Trading Store (Zustand + persist)
 *
 * Simulates a real trading account with a virtual $10,000 USDT balance.
 * State is persisted to localStorage so positions survive a page refresh.
 *
 * Supports:
 *   - Long (buy)  — profits when price rises
 *   - Short (sell) — profits when price falls
 *
 * ⚠️  This is for paper/practice trading only. No real money involved.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Constants ────────────────────────────────────────────────────────────────

const STARTING_BALANCE = 10_000; // $10,000 USDT
const MAX_HISTORY = 100; // keep last 100 closed trades
const MAX_JOURNAL = 200; // keep last 200 journal entries
export const COMMISSION_RATE = 0.0007; // 0.07% taker fee

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number; // base-asset qty (e.g. BTC)
  entryPrice: number; // price at which order was filled (USD)
  entryUsdtAmount: number; // USDT reserved at entry (what was deducted from balance)
  openedAt: number; // Unix ms
  takeProfit?: number; // price at which to auto-close for profit
  stopLoss?: number; // price at which to auto-close to limit loss
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number; // realized PnL in USDT (negative = loss)
  closedAt: number;
}

export type OrderStatus = 'filled' | 'cancelled' | 'rejected';
export type OrderType = 'market' | 'limit' | 'stop';

export interface PendingOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'stop';
  usdtAmount: number; // reserved at placement (deducted from balance)
  triggerPrice: number; // limit or stop trigger price
  qty: number; // pre-calculated: usdtAmount / triggerPrice
  takeProfit?: number;
  stopLoss?: number;
  placedAt: number;
}

export interface HistoricalOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: OrderType;
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  fillPrice?: number;
  status: OrderStatus;
  commission: number;
  placingTime: number;
  closingTime: number;
}

export interface BalanceEvent {
  id: string;
  time: number;
  balanceBefore: number;
  balanceAfter: number;
  pnl: number;
  action: string;
}

export interface JournalEntry {
  id: string;
  time: number;
  text: string;
  /** true only for notes the user manually added/edited */
  isUserNote?: boolean;
}

// ─── Store ────────────────────────────────────────────────────────────────────

// Helper – format quantity to a readable precision
function fmtQty(qty: number): string {
  if (qty >= 1000) return qty.toFixed(0);
  if (qty >= 1) return qty.toFixed(4);
  if (qty >= 0.001) return qty.toFixed(6);
  return qty.toFixed(8);
}

// Helper – format price to a readable precision
function fmtPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

interface PaperState {
  balance: number;
  positions: Position[];
  pendingOrders: PendingOrder[];
  history: ClosedTrade[];
  orders: HistoricalOrder[];
  realizedPnl: number;
  balanceLog: BalanceEvent[];
  journal: JournalEntry[];

  /**
   * Open a new position.
   * @param symbol   e.g. 'BTCUSDT'
   * @param side     'buy' opens long, 'sell' opens short
   * @param price    current market price
   * @param usdtAmount  amount of USDT to spend / use as margin
   * @param takeProfit  optional price level to auto-close with profit
   * @param stopLoss    optional price level to auto-close to cap loss
   * @returns  position id on success, null on validation failure
   */
  placeOrder: (
    symbol: string,
    side: 'buy' | 'sell',
    price: number,
    usdtAmount: number,
    takeProfit?: number,
    stopLoss?: number
  ) => string | null;

  /** Close an open position at the given exit price. */
  closePosition: (positionId: string, exitPrice: number) => void;

  /** Add a note to the journal. Pass isUserNote=false for system-generated entries (not user-editable). */
  addJournalNote: (text: string, isUserNote?: boolean) => void;

  /** Edit any journal entry (typically used for user notes). */
  editJournalEntry: (entryId: string, text: string) => void;

  /** Reset the account back to the starting balance. */
  reset: () => void;

  /**
   * Place a limit order. Balance is reserved immediately.
   * @returns order id on success, null on validation failure
   */
  placeLimitOrder: (
    symbol: string,
    side: 'buy' | 'sell',
    triggerPrice: number,
    usdtAmount: number,
    takeProfit?: number,
    stopLoss?: number
  ) => string | null;

  /**
   * Place a stop order. Balance is reserved immediately.
   * @returns order id on success, null on validation failure
   */
  placeStopOrder: (
    symbol: string,
    side: 'buy' | 'sell',
    triggerPrice: number,
    usdtAmount: number,
    takeProfit?: number,
    stopLoss?: number
  ) => string | null;

  /** Cancel a pending (limit or stop) order and refund the reserved amount. */
  cancelPendingOrder: (orderId: string) => void;
}

export const usePaperStore = create<PaperState>()(
  persist(
    (set, get) => ({
      balance: STARTING_BALANCE,
      positions: [],
      pendingOrders: [],
      history: [],
      orders: [],
      realizedPnl: 0,
      balanceLog: [],
      journal: [],

      placeOrder: (symbol, side, price, usdtAmount, takeProfit, stopLoss) => {
        const { balance } = get();

        // ── Validation ──────────────────────────────────────────────────────
        if (usdtAmount <= 0 || price <= 0) return null;
        // Include entry commission in the balance check — prevents going negative
        // when placing a 100%-of-balance order (usdtAmount + fee > balance).
        if (usdtAmount + usdtAmount * COMMISSION_RATE > balance) return null;

        const quantity = usdtAmount / price;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const commission = usdtAmount * COMMISSION_RATE;
        const now = Date.now();

        const position: Position = {
          id,
          symbol,
          side: side === 'buy' ? 'long' : 'short',
          quantity,
          entryPrice: price,
          entryUsdtAmount: usdtAmount,
          openedAt: now,
          ...(takeProfit && takeProfit > 0 ? { takeProfit } : {}),
          ...(stopLoss && stopLoss > 0 ? { stopLoss } : {}),
        };

        const order: HistoricalOrder = {
          id: `o-${id}`,
          symbol,
          side,
          type: 'market',
          qty: quantity,
          fillPrice: price,
          status: 'filled',
          commission,
          placingTime: now,
          closingTime: now,
        };

        const balBefore = balance;
        const balAfter = balance - usdtAmount - commission;

        const logEntry: BalanceEvent = {
          id: `bl-${id}`,
          time: now,
          balanceBefore: balBefore,
          balanceAfter: balAfter,
          pnl: 0,
          action: `Enter ${side === 'buy' ? 'long' : 'short'} position for ${symbol} at price ${price.toFixed(4)} for ${quantity.toFixed(6)} units`,
        };

        // ── Journal entries (TradingView style: 3 entries per market order) ──
        const readableOrderId = Math.floor(1000000000 + Math.random() * 9000000000);
        const qtyStr = fmtQty(quantity);
        const priceStr = fmtPrice(price);
        const journalEntries: JournalEntry[] = [
          {
            id: `j-${id}-exec`,
            time: now,
            text: `Order ${readableOrderId} for symbol ${symbol} has been executed at price ${priceStr} for ${qtyStr} units`,
          },
          {
            id: `j-${id}-placed`,
            time: now,
            text: `Order ${readableOrderId} successfully placed`,
          },
          {
            id: `j-${id}-call`,
            time: now,
            text: `Call to place market order to ${side} ${qtyStr} units of symbol ${symbol}`,
          },
        ];

        set((s) => ({
          balance: s.balance - usdtAmount - commission,
          positions: [...s.positions, position],
          orders: [order, ...s.orders].slice(0, MAX_HISTORY * 2),
          balanceLog: [logEntry, ...s.balanceLog].slice(0, MAX_HISTORY * 2),
          journal: [...journalEntries, ...s.journal].slice(0, MAX_JOURNAL),
        }));

        return id;
      },

      closePosition: (positionId, exitPrice) => {
        const { positions } = get();
        const pos = positions.find((p) => p.id === positionId);
        if (!pos) return;

        // ── PnL calculation ─────────────────────────────────────────────────
        // Long:  profit when exit > entry
        // Short: profit when exit < entry
        const pnl =
          pos.side === 'long'
            ? (exitPrice - pos.entryPrice) * pos.quantity
            : (pos.entryPrice - exitPrice) * pos.quantity;

        // Return margin + PnL to balance, minus exit commission (floor at 0 — no negative balance)
        const commission = pos.quantity * exitPrice * COMMISSION_RATE;
        // Entry commission was also paid at open — include it so realizedPnl reflects true net P&L
        const entryCommission = pos.entryUsdtAmount * COMMISSION_RATE;
        const returnAmount = Math.max(0, pos.entryUsdtAmount + pnl - commission);
        const now = Date.now();
        const closedId = `${now}-${Math.random().toString(36).slice(2, 7)}`;

        const closed: ClosedTrade = {
          id: positionId,
          symbol: pos.symbol,
          side: pos.side,
          quantity: pos.quantity,
          entryPrice: pos.entryPrice,
          exitPrice,
          pnl,
          closedAt: now,
        };

        const closingOrder: HistoricalOrder = {
          id: `o-close-${closedId}`,
          symbol: pos.symbol,
          side: pos.side === 'long' ? 'sell' : 'buy',
          type: 'market',
          qty: pos.quantity,
          fillPrice: exitPrice,
          status: 'filled',
          commission,
          placingTime: now,
          closingTime: now,
        };

        const balBefore = get().balance;
        const balAfter = balBefore + returnAmount;

        const logEntry: BalanceEvent = {
          id: `bl-close-${closedId}`,
          time: now,
          balanceBefore: balBefore,
          balanceAfter: balAfter,
          pnl: pnl - commission, // net PnL — matches actual balance impact
          action: `Close ${pos.side} position for ${pos.symbol} at price ${exitPrice.toFixed(4)} for ${pos.quantity.toFixed(6)} units`,
        };

        // ── Journal entries (TradingView style: 3 entries per closing order) ──
        const closingOrderId = Math.floor(1000000000 + Math.random() * 9000000000);
        const closingQtyStr = fmtQty(pos.quantity);
        const closingPriceStr = fmtPrice(exitPrice);
        const closingSide = pos.side === 'long' ? 'sell' : 'buy';
        const closingJournalEntries: JournalEntry[] = [
          {
            id: `j-close-${closedId}-exec`,
            time: now,
            text: `Order ${closingOrderId} for symbol ${pos.symbol} has been executed at price ${closingPriceStr} for ${closingQtyStr} units`,
          },
          {
            id: `j-close-${closedId}-placed`,
            time: now,
            text: `Order ${closingOrderId} successfully placed`,
          },
          {
            id: `j-close-${closedId}-call`,
            time: now,
            text: `Call to place market order to ${closingSide} ${closingQtyStr} units of symbol ${pos.symbol}`,
          },
        ];

        set((s) => ({
          balance: s.balance + returnAmount,
          positions: s.positions.filter((p) => p.id !== positionId),
          history: [closed, ...s.history].slice(0, MAX_HISTORY),
          orders: [closingOrder, ...s.orders].slice(0, MAX_HISTORY * 2),
          realizedPnl: s.realizedPnl + pnl - commission - entryCommission,
          balanceLog: [logEntry, ...s.balanceLog].slice(0, MAX_HISTORY * 2),
          journal: [...closingJournalEntries, ...s.journal].slice(0, MAX_JOURNAL),
        }));
      },

      addJournalNote: (text: string, isUserNote = true) => {
        const noteId = `j-note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const entry: JournalEntry = {
          id: noteId,
          time: Date.now(),
          text,
          isUserNote,
        };
        set((s) => ({
          journal: [entry, ...s.journal].slice(0, MAX_JOURNAL),
        }));
      },

      editJournalEntry: (entryId: string, text: string) => {
        set((s) => ({
          journal: s.journal.map((e) => {
            // System-generated entries are read-only — only user notes can be edited
            if (e.id !== entryId || !e.isUserNote) return e;
            return { ...e, text };
          }),
        }));
      },

      reset: () =>
        set({
          balance: STARTING_BALANCE,
          positions: [],
          pendingOrders: [],
          history: [],
          orders: [],
          realizedPnl: 0,
          balanceLog: [],
          journal: [],
        }),

      placeLimitOrder: (symbol, side, triggerPrice, usdtAmount, takeProfit, stopLoss) => {
        const { balance } = get();
        if (usdtAmount <= 0 || triggerPrice <= 0) return null;
        const totalCost = usdtAmount + usdtAmount * COMMISSION_RATE;
        if (totalCost > balance) return null;

        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const qty = usdtAmount / triggerPrice;
        const now = Date.now();

        const pending: PendingOrder = {
          id,
          symbol,
          side,
          type: 'limit',
          usdtAmount,
          triggerPrice,
          qty,
          placedAt: now,
          ...(takeProfit && takeProfit > 0 ? { takeProfit } : {}),
          ...(stopLoss && stopLoss > 0 ? { stopLoss } : {}),
        };

        const historicalOrder: HistoricalOrder = {
          id: `o-${id}`,
          symbol,
          side,
          type: 'limit',
          qty,
          limitPrice: triggerPrice,
          status: 'filled', // will be updated on execution; kept here as placement record
          commission: usdtAmount * COMMISSION_RATE,
          placingTime: now,
          closingTime: now,
        };

        set((s) => ({
          balance: s.balance - totalCost,
          pendingOrders: [...s.pendingOrders, pending],
          orders: [historicalOrder, ...s.orders].slice(0, MAX_HISTORY * 2),
        }));

        return id;
      },

      placeStopOrder: (symbol, side, triggerPrice, usdtAmount, takeProfit, stopLoss) => {
        const { balance } = get();
        if (usdtAmount <= 0 || triggerPrice <= 0) return null;
        const totalCost = usdtAmount + usdtAmount * COMMISSION_RATE;
        if (totalCost > balance) return null;

        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const qty = usdtAmount / triggerPrice;
        const now = Date.now();

        const pending: PendingOrder = {
          id,
          symbol,
          side,
          type: 'stop',
          usdtAmount,
          triggerPrice,
          qty,
          placedAt: now,
          ...(takeProfit && takeProfit > 0 ? { takeProfit } : {}),
          ...(stopLoss && stopLoss > 0 ? { stopLoss } : {}),
        };

        const historicalOrder: HistoricalOrder = {
          id: `o-${id}`,
          symbol,
          side,
          type: 'stop',
          qty,
          stopPrice: triggerPrice,
          status: 'filled', // placeholder; updated on execution
          commission: usdtAmount * COMMISSION_RATE,
          placingTime: now,
          closingTime: now,
        };

        set((s) => ({
          balance: s.balance - totalCost,
          pendingOrders: [...s.pendingOrders, pending],
          orders: [historicalOrder, ...s.orders].slice(0, MAX_HISTORY * 2),
        }));

        return id;
      },

      cancelPendingOrder: (orderId) => {
        const { pendingOrders } = get();
        const order = pendingOrders.find((o) => o.id === orderId);
        if (!order) return;

        const refund = order.usdtAmount + order.usdtAmount * COMMISSION_RATE;
        const now = Date.now();

        const cancelledOrder: HistoricalOrder = {
          id: `o-cancel-${orderId}`,
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          qty: order.qty,
          ...(order.type === 'limit'
            ? { limitPrice: order.triggerPrice }
            : { stopPrice: order.triggerPrice }),
          status: 'cancelled',
          commission: 0,
          placingTime: order.placedAt,
          closingTime: now,
        };

        set((s) => ({
          balance: s.balance + refund,
          pendingOrders: s.pendingOrders.filter((o) => o.id !== orderId),
          orders: [cancelledOrder, ...s.orders].slice(0, MAX_HISTORY * 2),
        }));
      },
    }),
    {
      name: 'cd-paper-trading', // localStorage key
    }
  )
);
