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

/** Bybit-style crypto leverage options (cross-margin perpetuals, max 125×). */
export const CRYPTO_LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 125] as const;
export type CryptoLeverage = (typeof CRYPTO_LEVERAGE_OPTIONS)[number];

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
  openedAt: number;
  closedAt: number;
}

export type OrderStatus = 'filled' | 'cancelled' | 'rejected';
export type OrderType = 'market' | 'limit' | 'stop' | 'take-profit' | 'stop-loss';

export interface PendingOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'stop';
  usdtAmount: number; // reserved at placement (deducted from balance)
  triggerPrice: number; // limit or stop trigger price
  qty: number; // pre-calculated leveraged base-asset qty: (usdtAmount * leverage) / triggerPrice
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
  /** USDT margin used for this order entry (= usdtAmount at placement; omitted for closing orders) */
  margin?: number;
  placingTime: number;
  closingTime: number;
  /** Human-readable reason why the order was rejected (only set when status === 'rejected') */
  rejectionReason?: string;
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
  /**
   * Net realized PnL (USDT) attached to system close entries only.
   * Positive = profit, negative = loss. Undefined for open/user entries.
   * Net = gross PnL − exit commission (matches Balance History column).
   */
  pnl?: number;
}

// ─── Store ────────────────────────────────────────────────────────────────────

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
   * Crypto leverage multiplier (Bybit-style). Default 1 = no leverage.
   * Affects position size: qty = (usdtAmount × leverage) / price.
   * The margin deducted from balance is always `usdtAmount`.
   */
  leverage: number;

  /** Update the crypto leverage multiplier. */
  setLeverage: (v: number) => void;

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
    stopLoss?: number,
    skipJournal?: boolean // new param to skip journal entry
  ) => string | null;

  /** Close an open position at the given exit price. */
  closePosition: (
    positionId: string,
    exitPrice: number,
    reason?: string,
    closeType?: OrderType
  ) => void;

  /** Add a note to the journal. Pass isUserNote=false for system-generated entries (not user-editable). */
  addJournalNote: (text: string, isUserNote?: boolean, pnl?: number) => void;

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

  /**
   * Fill a pending order without recording a cancellation entry.
   * Removes the order from pendingOrders and refunds the reserved amount so
   * placeOrder can deduct it again. Intended only for use by usePendingOrderMonitor.
   */
  fillPendingOrder: (orderId: string) => void;
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
      leverage: 1,

      setLeverage: (v) => set({ leverage: v }),

      placeOrder: (symbol, side, price, usdtAmount, takeProfit, stopLoss, skipJournal) => {
        const { leverage, positions } = get();

        // ── Validation ──────────────────────────────────────────────────────
        if (usdtAmount <= 0 || price <= 0) return null;

        // ── Position netting (TV-style) ─────────────────────────────────────
        const oppositeSide = side === 'buy' ? 'short' : 'long';
        const existingOpp = positions.filter((p) => p.symbol === symbol && p.side === oppositeSide);

        // skipOrderRecord: true when the netting path already wrote the single
        // order record for this user action (close+open-remainder case).
        let skipOrderRecord = false;

        if (existingOpp.length > 0) {
          const incomingQty = (usdtAmount * leverage) / price;
          let remainingQty = incomingQty;
          const now = Date.now();
          const newHistory: ClosedTrade[] = [];
          const newBalanceLogs: BalanceEvent[] = [];
          const newJournalEntries: JournalEntry[] = [];

          for (const pos of existingOpp) {
            if (remainingQty <= 0) break;

            const closeQty = Math.min(remainingQty, pos.quantity);
            const isFullClose = closeQty >= pos.quantity - 1e-10;
            const fraction = closeQty / pos.quantity;

            // PnL for the closed portion
            const pnlPartial =
              pos.side === 'long'
                ? (price - pos.entryPrice) * closeQty
                : (pos.entryPrice - price) * closeQty;
            const exitCommission = closeQty * price * COMMISSION_RATE;
            const entryCommissionPartial = pos.entryUsdtAmount * fraction * COMMISSION_RATE;
            const marginPartial = pos.entryUsdtAmount * fraction;
            const returnAmt = Math.max(0, marginPartial + pnlPartial - exitCommission);

            const closeId = `${now}-${Math.random().toString(36).slice(2, 7)}`;

            // NOTE: No separate close order added to `orders` here — TV records only 1
            // order per user action (the incoming order). The netting is silent position math.

            newHistory.push({
              id: pos.id,
              symbol: pos.symbol,
              side: pos.side,
              quantity: closeQty,
              entryPrice: pos.entryPrice,
              exitPrice: price,
              pnl: pnlPartial,
              openedAt: pos.openedAt,
              closedAt: now,
            });

            const netPnl = pnlPartial - exitCommission;
            const closedSide = pos.side === 'long' ? 'LONG' : 'SHORT';
            if (!skipJournal) {
              newJournalEntries.push({
                id: `j-close-${closeId}-exec`,
                time: now,
                text: `Closed ${closedSide} ${pos.symbol} @ $${fmtPrice(price)}`,
                pnl: netPnl,
              });
            }

            const curBal = get().balance;
            newBalanceLogs.push({
              id: `bl-close-${closeId}`,
              time: now,
              balanceBefore: curBal,
              balanceAfter: curBal + returnAmt,
              pnl: netPnl,
              action: `Close ${pos.side} position for ${pos.symbol} at price ${price.toFixed(4)} for ${closeQty.toFixed(6)} units`,
            });

            remainingQty -= closeQty;

            // Update or remove the existing position in state
            set((s) => {
              if (isFullClose) {
                return {
                  balance: s.balance + returnAmt,
                  positions: s.positions.filter((p) => p.id !== pos.id),
                  history: [newHistory[newHistory.length - 1], ...s.history].slice(0, MAX_HISTORY),
                  realizedPnl: s.realizedPnl + pnlPartial - exitCommission - entryCommissionPartial,
                  balanceLog: [newBalanceLogs[newBalanceLogs.length - 1], ...s.balanceLog].slice(
                    0,
                    MAX_HISTORY * 2
                  ),
                  journal: [...newJournalEntries.slice(-1), ...s.journal].slice(0, MAX_JOURNAL),
                };
              } else {
                // Partial close — reduce quantity and proportional margin
                return {
                  balance: s.balance + returnAmt,
                  positions: s.positions.map((p) =>
                    p.id !== pos.id
                      ? p
                      : {
                          ...p,
                          quantity: p.quantity - closeQty,
                          entryUsdtAmount: p.entryUsdtAmount * (1 - fraction),
                        }
                  ),
                  history: [newHistory[newHistory.length - 1], ...s.history].slice(0, MAX_HISTORY),
                  realizedPnl: s.realizedPnl + pnlPartial - exitCommission - entryCommissionPartial,
                  balanceLog: [newBalanceLogs[newBalanceLogs.length - 1], ...s.balanceLog].slice(
                    0,
                    MAX_HISTORY * 2
                  ),
                  journal: [...newJournalEntries.slice(-1), ...s.journal].slice(0, MAX_JOURNAL),
                };
              }
            });
          }

          // Record the single incoming order (TV-style: 1 order per user action).
          // Commission covers the closed portion; the remainder's open commission is
          // added here too so the total commission matches the full incomingQty fill.
          const remainderCommission = Math.max(0, remainingQty) * price * COMMISSION_RATE;
          const incomingOrderId = `net-${now}-${Math.random().toString(36).slice(2, 7)}`;
          const closedQty = incomingQty - Math.max(0, remainingQty);
          const incomingOrder: HistoricalOrder = {
            id: `o-${incomingOrderId}`,
            symbol,
            side,
            type: 'market',
            qty: incomingQty,
            fillPrice: price,
            status: 'filled',
            commission: closedQty * price * COMMISSION_RATE + remainderCommission,
            placingTime: now,
            closingTime: now,
          };
          set((s) => ({
            orders: [incomingOrder, ...s.orders].slice(0, MAX_HISTORY * 2),
          }));

          // If the incoming order was fully consumed closing existing positions, done.
          if (remainingQty <= 1e-10) {
            return incomingOrderId;
          }

          // Otherwise, fall through to open a new position with the remaining qty.
          // The order record is already written above — skip writing another one.
          skipOrderRecord = true;
          usdtAmount = (remainingQty * price) / leverage;
        }

        // Include entry commission in the balance check — prevents going negative
        // when placing a 100%-of-balance order (usdtAmount + fee > balance).
        if (usdtAmount + usdtAmount * COMMISSION_RATE > get().balance) {
          // Record the rejection so it surfaces in the History tab with a warning icon
          const rejId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const now = Date.now();
          const rejectedOrder: HistoricalOrder = {
            id: `o-rej-${rejId}`,
            symbol,
            side,
            type: 'market',
            qty: price > 0 ? (usdtAmount * leverage) / price : 0,
            status: 'rejected',
            commission: 0,
            margin: usdtAmount,
            placingTime: now,
            closingTime: now,
            rejectionReason: 'Not enough funds to complete the order.',
          };
          set((s) => ({
            orders: [rejectedOrder, ...s.orders].slice(0, MAX_HISTORY * 2),
          }));
          return null;
        }

        const quantity = (usdtAmount * leverage) / price;
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
          margin: usdtAmount,
          placingTime: now,
          closingTime: now,
        };

        // Use get().balance here (not the `balance` captured at function start) so that
        // any netting set() calls are reflected in the balance log correctly.
        const currentBalance = get().balance;
        const balBefore = currentBalance;
        const balAfter = currentBalance - usdtAmount - commission;

        const logEntry: BalanceEvent = {
          id: `bl-${id}`,
          time: now,
          balanceBefore: balBefore,
          balanceAfter: balAfter,
          pnl: 0,
          action: `Enter ${side === 'buy' ? 'long' : 'short'} position for ${symbol} at price ${price.toFixed(4)} for ${quantity.toFixed(6)} units`,
        };

        // ── Journal entry ─────────────────────────────────────────────────────
        const journalEntries: JournalEntry[] = [];
        if (!skipJournal) {
          const positionSide = side === 'buy' ? 'LONG' : 'SHORT';
          journalEntries.push({
            id: `j-${id}-open`,
            time: now,
            text: `Opened ${positionSide} ${symbol} @ $${fmtPrice(price)}`,
          });
        }

        set((s) => ({
          balance: s.balance - usdtAmount - commission,
          positions: [...s.positions, position],
          orders: skipOrderRecord ? s.orders : [order, ...s.orders].slice(0, MAX_HISTORY * 2),
          balanceLog: [logEntry, ...s.balanceLog].slice(0, MAX_HISTORY * 2),
          journal: [...journalEntries, ...s.journal].slice(0, MAX_JOURNAL),
        }));

        return id;
      },

      closePosition: (positionId, exitPrice, reason, closeType) => {
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
          openedAt: pos.openedAt,
          closedAt: now,
        };

        const closingOrder: HistoricalOrder = {
          id: `o-close-${closedId}`,
          symbol: pos.symbol,
          side: pos.side === 'long' ? 'sell' : 'buy',
          type: closeType ?? 'market',
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

        // ── Journal entry ─────────────────────────────────────────────────────
        // Net PnL = gross PnL − exit commission — same figure shown in Balance History.
        const netPnl = pnl - commission;
        const closingJournalEntries: JournalEntry[] = [];
        if (reason) {
          // Caller-supplied reason (e.g. TP/SL auto-close) — use it as the entry text
          closingJournalEntries.push({
            id: `j-close-${closedId}-reason`,
            time: now,
            text: reason,
            pnl: netPnl,
          });
        } else {
          // Manual close — generic "Closed" entry with PnL badge
          const closedSide = pos.side === 'long' ? 'LONG' : 'SHORT';
          closingJournalEntries.push({
            id: `j-close-${closedId}-exec`,
            time: now,
            text: `Closed ${closedSide} ${pos.symbol} @ $${fmtPrice(exitPrice)}`,
            pnl: netPnl,
          });
        }

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

      addJournalNote: (text: string, isUserNote = true, pnl?: number) => {
        const noteId = `j-note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const entry: JournalEntry = {
          id: noteId,
          time: Date.now(),
          text,
          isUserNote,
          ...(pnl !== undefined ? { pnl } : {}),
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
        const { balance, leverage } = get();
        if (usdtAmount <= 0 || triggerPrice <= 0) return null;
        const totalCost = usdtAmount + usdtAmount * COMMISSION_RATE;
        if (totalCost > balance) return null;

        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const qty = (usdtAmount * leverage) / triggerPrice;
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
          status: 'filled',
          commission: usdtAmount * COMMISSION_RATE,
          margin: usdtAmount,
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
        const { balance, leverage } = get();
        if (usdtAmount <= 0 || triggerPrice <= 0) return null;
        const totalCost = usdtAmount + usdtAmount * COMMISSION_RATE;
        if (totalCost > balance) return null;

        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const qty = (usdtAmount * leverage) / triggerPrice;
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
          status: 'filled',
          commission: usdtAmount * COMMISSION_RATE,
          margin: usdtAmount,
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

      fillPendingOrder: (orderId) => {
        const { pendingOrders } = get();
        const order = pendingOrders.find((o) => o.id === orderId);
        if (!order) return;
        // Refund reserved amount so placeOrder can re-deduct it — no cancellation record.
        const refund = order.usdtAmount + order.usdtAmount * COMMISSION_RATE;
        set((s) => ({
          balance: s.balance + refund,
          pendingOrders: s.pendingOrders.filter((o) => o.id !== orderId),
        }));
      },
    }),
    {
      name: 'cd-paper-trading', // localStorage key
    }
  )
);
