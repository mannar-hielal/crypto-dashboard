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
const COMMISSION_RATE = 0.0007; // 0.07% taker fee

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

  /** Add a custom user note to the journal. */
  addJournalNote: (text: string) => void;

  /** Edit any journal entry (typically used for user notes). */
  editJournalEntry: (entryId: string, text: string) => void;

  /** Reset the account back to the starting balance. */
  reset: () => void;
}

export const usePaperStore = create<PaperState>()(
  persist(
    (set, get) => ({
      balance: STARTING_BALANCE,
      positions: [],
      history: [],
      orders: [],
      realizedPnl: 0,
      balanceLog: [],
      journal: [],

      placeOrder: (symbol, side, price, usdtAmount, takeProfit, stopLoss) => {
        const { balance } = get();

        // ── Validation ──────────────────────────────────────────────────────
        if (usdtAmount <= 0 || price <= 0) return null;
        if (usdtAmount > balance) return null; // not enough funds

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
        const balAfter = balance - usdtAmount;

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
          balance: s.balance - usdtAmount,
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

        // Return margin + PnL to balance (floor at 0 — no negative balance)
        const returnAmount = Math.max(0, pos.entryUsdtAmount + pnl);
        const commission = pos.quantity * exitPrice * COMMISSION_RATE;
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
          pnl,
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
          realizedPnl: s.realizedPnl + pnl,
          balanceLog: [logEntry, ...s.balanceLog].slice(0, MAX_HISTORY * 2),
          journal: [...closingJournalEntries, ...s.journal].slice(0, MAX_JOURNAL),
        }));
      },

      addJournalNote: (text: string) => {
        const noteId = `j-note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const entry: JournalEntry = {
          id: noteId,
          time: Date.now(),
          text,
          isUserNote: true,
        };
        set((s) => ({
          journal: [entry, ...s.journal].slice(0, MAX_JOURNAL),
        }));
      },

      editJournalEntry: (entryId: string, text: string) => {
        set((s) => ({
          journal: s.journal.map((e) => (e.id === entryId ? { ...e, text } : e)),
        }));
      },

      reset: () =>
        set({
          balance: STARTING_BALANCE,
          positions: [],
          history: [],
          orders: [],
          realizedPnl: 0,
          balanceLog: [],
          journal: [],
        }),
    }),
    {
      name: 'cd-paper-trading', // localStorage key
    }
  )
);
