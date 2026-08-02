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
import { fmtPrice } from '@/lib/utils';
import { paperApi } from '@crypto-dashboard/sdk';
import { useAuthStore } from './authStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const STARTING_BALANCE = 10_000; // $10,000 USDT
const MAX_HISTORY = 100; // keep last 100 closed trades
const MAX_JOURNAL = 200; // keep last 200 journal entries
export const COMMISSION_RATE = 0.0007; // 0.07% taker fee

/** Maximum allowed leverage for paper trading (learning-app safety cap). */
export const MAX_LEVERAGE = 10;

/** Leverage options available in the Account Settings selector (capped at MAX_LEVERAGE). */
export const CRYPTO_LEVERAGE_OPTIONS = [1, 2, 3, 5, MAX_LEVERAGE] as const;
export type CryptoLeverage = (typeof CRYPTO_LEVERAGE_OPTIONS)[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Position {
  id: string; // local ID or server ID
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
  id: string; // local ID or server ID
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
  id: string; // local ID or server ID
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
  /** true only for notes the user manually added/edited; false for system-generated entries */
  isUserNote?: boolean;
  /**
   * Net realized PnL (USDT) attached to system close entries only.
   * Positive = profit, negative = loss. Undefined for open/user entries.
   * Net = gross PnL − exit commission (matches Balance History column).
   */
  pnl?: number;
}
// ─── Store ────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isSameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function isSameOptionalNumber(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return isSameNumber(a, b);
}

function getPendingSideLabel(side: PendingOrder['side']): 'Long' | 'Short' {
  return side === 'buy' ? 'Long' : 'Short';
}

function getPendingTypeLabel(type: PendingOrder['type']): 'LIMIT' | 'STOP' {
  return type === 'limit' ? 'LIMIT' : 'STOP';
}

function buildExitSummaryPart(
  label: 'TP' | 'SL',
  previousPrice: number | null,
  nextPrice: number | null
): string | null {
  if (isSameOptionalNumber(previousPrice, nextPrice)) return null;
  if (previousPrice === null && nextPrice !== null)
    return `${label} set to $${fmtPrice(nextPrice)}`;
  if (previousPrice !== null && nextPrice === null) return `${label} removed`;
  if (previousPrice !== null && nextPrice !== null) {
    return `${label} $${fmtPrice(previousPrice)} → $${fmtPrice(nextPrice)}`;
  }
  return null;
}

function createSystemJournalEntry(entry: Omit<JournalEntry, 'isUserNote'>): JournalEntry {
  return { ...entry, isUserNote: false };
}

function buildPositionExitJournalEntries(
  pos: Position,
  takeProfit: number | null,
  stopLoss: number | null,
  now: number
): JournalEntry[] {
  const previousTp = pos.takeProfit ?? null;
  const previousSl = pos.stopLoss ?? null;
  const tpChanged = !isSameOptionalNumber(previousTp, takeProfit);
  const slChanged = !isSameOptionalNumber(previousSl, stopLoss);
  const summaryParts = [
    buildExitSummaryPart('TP', previousTp, takeProfit),
    buildExitSummaryPart('SL', previousSl, stopLoss),
  ].filter((part): part is string => !!part);

  if (!tpChanged && !slChanged) return [];

  const entries: JournalEntry[] = [];

  if (slChanged) {
    entries.push(
      createSystemJournalEntry({
        id: `j-edit-exits-sl-${pos.id}-${now}`,
        time: now,
        text:
          stopLoss === null
            ? `Stop-Loss cancelled for ${pos.side.toUpperCase()} ${pos.symbol} @ $${fmtPrice(previousSl!)}`
            : previousSl === null
              ? `Stop-Loss order added for ${pos.side.toUpperCase()} ${pos.symbol} @ $${fmtPrice(stopLoss)}`
              : `Stop-Loss modification confirmed — ${pos.side.toUpperCase()} ${pos.symbol} @ $${fmtPrice(stopLoss)}`,
      })
    );
  }

  if (tpChanged) {
    entries.push(
      createSystemJournalEntry({
        id: `j-edit-exits-tp-${pos.id}-${now}`,
        time: now,
        text:
          takeProfit === null
            ? `Take-Profit cancelled for ${pos.side.toUpperCase()} ${pos.symbol} @ $${fmtPrice(previousTp!)}`
            : previousTp === null
              ? `Take-Profit order added for ${pos.side.toUpperCase()} ${pos.symbol} @ $${fmtPrice(takeProfit)}`
              : `Take-Profit modification confirmed — ${pos.side.toUpperCase()} ${pos.symbol} @ $${fmtPrice(takeProfit)}`,
      })
    );
  }

  if (summaryParts.length) {
    entries.push(
      createSystemJournalEntry({
        id: `j-edit-exits-summary-${pos.id}-${now}`,
        time: now,
        text: `Modified ${pos.side.toUpperCase()} ${pos.symbol} exits — ${summaryParts.join(', ')}`,
      })
    );
  }

  return entries;
}

function buildPendingOrderEditJournalEntries(
  order: PendingOrder,
  newTriggerPrice: number,
  newUsdtAmount: number,
  newQty: number,
  newTakeProfit: number | null,
  newStopLoss: number | null,
  now: number
): JournalEntry[] {
  const previousTp = order.takeProfit ?? null;
  const previousSl = order.stopLoss ?? null;
  const pendingSideLabel = getPendingSideLabel(order.side);
  const entries: JournalEntry[] = [];
  const summaryParts: string[] = [];

  if (!isSameNumber(order.triggerPrice, newTriggerPrice)) {
    summaryParts.push(`price $${fmtPrice(order.triggerPrice)} → $${fmtPrice(newTriggerPrice)}`);
  }
  if (!isSameNumber(order.qty, newQty)) {
    summaryParts.push(`qty ${order.qty.toFixed(6)} → ${newQty.toFixed(6)}`);
  }
  if (!isSameNumber(order.usdtAmount, newUsdtAmount)) {
    summaryParts.push(`reserved $${order.usdtAmount.toFixed(2)} → $${newUsdtAmount.toFixed(2)}`);
  }

  const tpSummary = buildExitSummaryPart('TP', previousTp, newTakeProfit);
  if (tpSummary) summaryParts.push(tpSummary);
  const slSummary = buildExitSummaryPart('SL', previousSl, newStopLoss);
  if (slSummary) summaryParts.push(slSummary);

  if (!isSameOptionalNumber(previousSl, newStopLoss)) {
    entries.push(
      createSystemJournalEntry({
        id: `j-edit-pending-sl-${order.id}-${now}`,
        time: now,
        text:
          newStopLoss === null
            ? `Stop-Loss cancelled for pending ${pendingSideLabel} ${order.symbol} @ $${fmtPrice(previousSl!)}`
            : previousSl === null
              ? `Stop-Loss order added for pending ${pendingSideLabel} ${order.symbol} @ $${fmtPrice(newStopLoss)}`
              : `Stop-Loss modification confirmed for pending ${pendingSideLabel} ${order.symbol} @ $${fmtPrice(newStopLoss)}`,
      })
    );
  }

  if (!isSameOptionalNumber(previousTp, newTakeProfit)) {
    entries.push(
      createSystemJournalEntry({
        id: `j-edit-pending-tp-${order.id}-${now}`,
        time: now,
        text:
          newTakeProfit === null
            ? `Take-Profit cancelled for pending ${pendingSideLabel} ${order.symbol} @ $${fmtPrice(previousTp!)}`
            : previousTp === null
              ? `Take-Profit order added for pending ${pendingSideLabel} ${order.symbol} @ $${fmtPrice(newTakeProfit)}`
              : `Take-Profit modification confirmed for pending ${pendingSideLabel} ${order.symbol} @ $${fmtPrice(newTakeProfit)}`,
      })
    );
  }

  if (summaryParts.length) {
    entries.push(
      createSystemJournalEntry({
        id: `j-edit-pending-summary-${order.id}-${now}`,
        time: now,
        text: `Modified ${getPendingTypeLabel(order.type)} ${pendingSideLabel} ${order.symbol} — ${summaryParts.join(', ')}`,
      })
    );
  }

  return entries;
}

function isPositionSnapshot(value: unknown): value is Position {
  if (!isRecord(value)) return false;
  if (!isString(value['id']) || !isString(value['symbol'])) return false;
  if (value['side'] !== 'long' && value['side'] !== 'short') return false;
  if (!isPositiveNumber(value['quantity'])) return false;
  if (!isPositiveNumber(value['entryPrice'])) return false;
  if (!isPositiveNumber(value['entryUsdtAmount'])) return false;
  if (!isFiniteNumber(value['openedAt'])) return false;
  if (value['takeProfit'] !== undefined && !isPositiveNumber(value['takeProfit'])) return false;
  if (value['stopLoss'] !== undefined && !isPositiveNumber(value['stopLoss'])) return false;
  return true;
}

function isClosedTradeSnapshot(value: unknown): value is ClosedTrade {
  if (!isRecord(value)) return false;
  if (!isString(value['id']) || !isString(value['symbol'])) return false;
  if (value['side'] !== 'long' && value['side'] !== 'short') return false;
  if (!isPositiveNumber(value['quantity'])) return false;
  if (!isPositiveNumber(value['entryPrice']) || !isPositiveNumber(value['exitPrice'])) return false;
  if (!isFiniteNumber(value['pnl'])) return false;
  if (!isFiniteNumber(value['openedAt']) || !isFiniteNumber(value['closedAt'])) return false;
  return true;
}

function isPendingOrderSnapshot(value: unknown): value is PendingOrder {
  if (!isRecord(value)) return false;
  if (!isString(value['id']) || !isString(value['symbol'])) return false;
  if (value['side'] !== 'buy' && value['side'] !== 'sell') return false;
  if (value['type'] !== 'limit' && value['type'] !== 'stop') return false;
  if (!isPositiveNumber(value['usdtAmount'])) return false;
  if (!isPositiveNumber(value['triggerPrice'])) return false;
  if (!isPositiveNumber(value['qty'])) return false;
  if (!isFiniteNumber(value['placedAt'])) return false;
  if (value['takeProfit'] !== undefined && !isPositiveNumber(value['takeProfit'])) return false;
  if (value['stopLoss'] !== undefined && !isPositiveNumber(value['stopLoss'])) return false;
  return true;
}

function isHistoricalOrderSnapshot(value: unknown): value is HistoricalOrder {
  if (!isRecord(value)) return false;
  if (!isString(value['id']) || !isString(value['symbol'])) return false;
  if (value['side'] !== 'buy' && value['side'] !== 'sell') return false;
  if (
    value['type'] !== 'market' &&
    value['type'] !== 'limit' &&
    value['type'] !== 'stop' &&
    value['type'] !== 'take-profit' &&
    value['type'] !== 'stop-loss'
  ) {
    return false;
  }
  if (
    value['status'] !== 'filled' &&
    value['status'] !== 'cancelled' &&
    value['status'] !== 'rejected'
  ) {
    return false;
  }
  if (!isPositiveNumber(value['qty'])) return false;
  if (!isFiniteNumber(value['commission'])) return false;
  if (!isFiniteNumber(value['placingTime']) || !isFiniteNumber(value['closingTime'])) return false;
  if (value['limitPrice'] !== undefined && !isFiniteNumber(value['limitPrice'])) return false;
  if (value['stopPrice'] !== undefined && !isFiniteNumber(value['stopPrice'])) return false;
  if (value['fillPrice'] !== undefined && !isFiniteNumber(value['fillPrice'])) return false;
  if (value['margin'] !== undefined && !isFiniteNumber(value['margin'])) return false;
  return true;
}

function isBalanceEventSnapshot(value: unknown): value is BalanceEvent {
  if (!isRecord(value)) return false;
  if (!isString(value['id']) || !isString(value['action'])) return false;
  if (!isFiniteNumber(value['time'])) return false;
  if (!isFiniteNumber(value['balanceBefore'])) return false;
  if (!isFiniteNumber(value['balanceAfter'])) return false;
  if (!isFiniteNumber(value['pnl'])) return false;
  return true;
}

function isJournalEntrySnapshot(value: unknown): value is JournalEntry {
  if (!isRecord(value)) return false;
  if (!isString(value['id']) || !isString(value['text'])) return false;
  if (!isFiniteNumber(value['time'])) return false;
  if (value['isUserNote'] !== undefined && typeof value['isUserNote'] !== 'boolean') return false;
  if (value['pnl'] !== undefined && !isFiniteNumber(value['pnl'])) return false;
  return true;
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

  /** Status of server-side data synchronization. */
  isSyncing: boolean;
  /** Last time the store was successfully synchronized with the server. */
  lastSyncAt: number | null;

  /** Synchronize the local state with the server if authenticated. */
  syncWithServer: (accessToken: string) => Promise<void>;

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
    skipJournal?: boolean,
    relatedOrderId?: string // ─── New param ─────────
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

  /** Cancel one active TP/SL exit leg for an open position. */
  cancelExitOrder: (positionId: string, exitType: 'take-profit' | 'stop-loss') => void;

  /** Cancel one inactive TP/SL exit leg attached to a pending (unfilled) order bracket. No balance refund — the parent order still holds the margin. */
  cancelPendingExitLeg: (pendingOrderId: string, exitType: 'take-profit' | 'stop-loss') => void;

  /**
   * Fill a pending order without recording a cancellation entry.
   * Removes the order from pendingOrders and refunds the reserved amount so
   * placeOrder can deduct it again. Intended only for use by usePendingOrderMonitor.
   */
  fillPendingOrder: (orderId: string) => void;

  /**
   * Update TP/SL exits for an open position.
   * Pass null to remove a leg. Writes cancel HistoricalOrder records for any
   * leg being removed or replaced, and adds a journal entry.
   */
  updatePositionExits: (
    positionId: string,
    takeProfit: number | null,
    stopLoss: number | null
  ) => void;

  /**
   * Edit a pending limit/stop order.
   * Refunds the old reserved margin, checks the new cost against available balance.
   *   'ok'       — order updated in-place, balance settled
   *   'rejected' — new cost exceeds balance; order marked rejected, child TP/SL cancelled
   *   'not-found' — orderId not in pendingOrders
   */
  editPendingOrder: (
    orderId: string,
    newTriggerPrice: number,
    newUsdtAmount: number,
    newTakeProfit: number | null,
    newStopLoss: number | null
  ) => 'ok' | 'rejected' | 'not-found';
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

      isSyncing: false,
      lastSyncAt: null,

      syncWithServer: async (accessToken) => {
        if (get().isSyncing) return;
        set({ isSyncing: true });

        try {
          const [acc, serverOrders, serverTrades, serverPositions] = await Promise.all([
            paperApi.getAccount(accessToken),
            paperApi.getOrders({ limit: 100 }, accessToken),
            paperApi.getTrades({ limit: 100 }, accessToken),
            paperApi.getPositions(accessToken),
          ]);

          // ── Legacy Migration ───────────────────────────────────────────
          // If the server account is fresh ($10,000, no orders, no trades, no positions)
          // BUT the local store has activity, push the local state to the server.
          const isServerFresh =
            parseFloat(acc.availableBalance) === STARTING_BALANCE &&
            serverOrders.length === 0 &&
            serverTrades.length === 0 &&
            serverPositions.length === 0;

          const isLocalActive =
            get().balance !== STARTING_BALANCE ||
            get().history.length > 0 ||
            get().positions.length > 0;

          if (isServerFresh && isLocalActive) {
            if (import.meta.env.DEV)
              console.log('Migrating local paper trading state to server...');
            // In a full sync, we'd push EVERYTHING. For Phase 3.0, we prioritize balance.
            await paperApi.updateAccount(
              {
                totalBalance: (get().balance + get().realizedPnl).toString(),
                availableBalance: get().balance.toString(),
                realizedPnl: get().realizedPnl.toString(),
              },
              accessToken
            );

            // Backfill positions if any
            for (const pos of get().positions) {
              await paperApi.createOrder(
                {
                  refId: pos.id,
                  symbol: pos.symbol,
                  side: pos.side === 'long' ? 'BUY' : 'SELL',
                  orderType: 'MARKET',
                  quantity: pos.quantity.toString(),
                  limitPrice: pos.entryPrice.toString(),
                  takeProfit: pos.takeProfit?.toString(),
                  stopLoss: pos.stopLoss?.toString(),
                  margin: pos.entryUsdtAmount.toString(),
                },
                accessToken
              );

              // 🔐 Explicitly create the position on the server during migration.
              // This is now required because the server's POST /orders no longer creates positions.
              await paperApi.createPosition(
                {
                  refId: pos.id,
                  symbol: pos.symbol,
                  side: pos.side === 'long' ? 'LONG' : 'SHORT',
                  quantity: pos.quantity.toString(),
                  entryPrice: pos.entryPrice.toString(),
                  margin: pos.entryUsdtAmount.toString(),
                  takeProfit: pos.takeProfit?.toString() ?? null,
                  stopLoss: pos.stopLoss?.toString() ?? null,
                },
                accessToken
              );
            }
          }

          // Mapping server orders back to HistoricalOrder[]
          // Filter out PENDING orders for the history tab; those go to pendingOrders
          const pendingOrders: PendingOrder[] = serverOrders
            .filter((o) => o.status === 'PENDING')
            .map((o) => ({
              id: o.refId || o.id, // Use refId if available to match local state
              symbol: o.symbol,
              side: o.side.toLowerCase() as 'buy' | 'sell',
              type: o.orderType.toLowerCase() as 'limit' | 'stop',
              usdtAmount: parseFloat(o.margin),
              triggerPrice:
                o.orderType === 'LIMIT' ? parseFloat(o.limitPrice!) : parseFloat(o.stopPrice!),
              qty: parseFloat(o.quantity),
              takeProfit: o.takeProfit ? parseFloat(o.takeProfit) : undefined,
              stopLoss: o.stopLoss ? parseFloat(o.stopLoss) : undefined,
              placedAt: new Date(o.createdAt).getTime(),
            }));

          const orders: HistoricalOrder[] = serverOrders
            .filter((o) => o.status !== 'PENDING')
            .map((o) => ({
              id: o.refId || o.id,
              symbol: o.symbol,
              side: o.side.toLowerCase() as 'buy' | 'sell',
              type: o.orderType.toLowerCase() as OrderType,
              qty: parseFloat(o.quantity),
              limitPrice: o.limitPrice ? parseFloat(o.limitPrice) : undefined,
              stopPrice: o.stopPrice ? parseFloat(o.stopPrice) : undefined,
              fillPrice: o.averageFilledPrice ? parseFloat(o.averageFilledPrice) : undefined,
              status: o.status.toLowerCase() as OrderStatus,
              commission: parseFloat(o.commission),
              margin: o.margin ? parseFloat(o.margin) : undefined,
              placingTime: new Date(o.createdAt).getTime(),
              closingTime: o.filledAt
                ? new Date(o.filledAt).getTime()
                : o.cancelledAt
                  ? new Date(o.cancelledAt).getTime()
                  : new Date(o.updatedAt).getTime(),
              rejectionReason: o.rejectionReason ?? undefined,
            }));

          // Mapping trades
          const history: ClosedTrade[] = serverTrades.map((t) => ({
            id: t.refId || t.id,
            symbol: t.symbol,
            side: t.side.toLowerCase() as 'long' | 'short',
            quantity: parseFloat(t.quantity),
            entryPrice: t.entryPrice ? parseFloat(t.entryPrice) : 0,
            exitPrice: parseFloat(t.executedPrice),
            pnl: parseFloat(t.pnl),
            openedAt: t.openedAt ? new Date(t.openedAt).getTime() : 0,
            closedAt: new Date(t.executedAt).getTime(),
          }));

          const positions: Position[] = serverPositions.map((p) => ({
            id: p.refId || p.id,
            symbol: p.symbol,
            side: p.side.toLowerCase() as 'long' | 'short',
            quantity: parseFloat(p.quantity),
            entryPrice: parseFloat(p.entryPrice),
            entryUsdtAmount: parseFloat(p.margin),
            openedAt: new Date(p.openedAt).getTime(),
            takeProfit: p.takeProfit ? parseFloat(p.takeProfit) : undefined,
            stopLoss: p.stopLoss ? parseFloat(p.stopLoss) : undefined,
          }));

          set({
            balance: parseFloat(acc.availableBalance),
            realizedPnl: parseFloat(acc.realizedPnl),
            orders,
            history,
            positions,
            pendingOrders,
            lastSyncAt: Date.now(),
          });
        } catch (err) {
          if (import.meta.env.DEV) console.error('Failed to sync paper trading state:', err);
        } finally {
          set({ isSyncing: false });
        }
      },

      setLeverage: (v) =>
        set({
          leverage: Math.min(Math.max(Number.isFinite(v) ? Math.round(v) : 1, 1), MAX_LEVERAGE),
        }),

      placeOrder: (
        symbol,
        side,
        price,
        usdtAmount,
        takeProfit,
        stopLoss,
        skipJournal,
        relatedOrderId // ─── New param ─────────
      ) => {
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
              id: closeId,
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
              newJournalEntries.push(
                createSystemJournalEntry({
                  id: `j-close-${closeId}-exec`,
                  time: now,
                  text: `Closed ${closedSide} ${pos.symbol} @ $${fmtPrice(price)}`,
                  pnl: netPnl,
                })
              );
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

            // ── Server Sync for Netting ──────────────────────────────────────
            const token = useAuthStore.getState().accessToken;
            if (token) {
              const netPnl = pnlPartial - exitCommission;
              paperApi
                .recordTrade(
                  {
                    refId: closeId,
                    symbol: pos.symbol,
                    side: pos.side === 'long' ? 'SELL' : 'BUY',
                    quantity: closeQty.toString(),
                    executedPrice: price.toString(),
                    entryPrice: pos.entryPrice.toString(),
                    totalCost: (closeQty * price).toString(),
                    commission: exitCommission.toString(),
                    pnl: netPnl.toString(),
                    pnlPercent: (netPnl / (marginPartial || 1)).toString(),
                    orderId: relatedOrderId || pos.id, // Use the incoming order ID if available
                    openedAt: new Date(pos.openedAt).toISOString(),
                  },
                  token
                )
                .then(async () => {
                  if (isFullClose) {
                    await paperApi.deletePosition(pos.id, token);
                    return;
                  }

                  await paperApi.updatePosition(
                    pos.id,
                    {
                      quantity: (pos.quantity - closeQty).toString(),
                      margin: (pos.entryUsdtAmount * (1 - fraction)).toString(),
                    },
                    token
                  );
                })
                .catch((e) => {
                  if (import.meta.env.DEV) console.error('Failed to sync netting to server:', e);
                });
            }
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

        // ── Journal entry ───────────────────────────────────────────────────────
        const journalEntries: JournalEntry[] = [];
        if (!skipJournal) {
          const positionSide = side === 'buy' ? 'LONG' : 'SHORT';
          journalEntries.push(
            createSystemJournalEntry({
              id: `j-${id}-open`,
              time: now,
              text: `Opened ${positionSide} ${symbol} @ $${fmtPrice(price)}`,
            })
          );
        }

        set((s) => ({
          balance: s.balance - usdtAmount - commission,
          positions: [...s.positions, position],
          orders: skipOrderRecord ? s.orders : [order, ...s.orders].slice(0, MAX_HISTORY * 2),
          balanceLog: [logEntry, ...s.balanceLog].slice(0, MAX_HISTORY * 2),
          journal: [...journalEntries, ...s.journal].slice(0, MAX_JOURNAL),
        }));

        // ── Server Sync ──────────────────────────────────────────────────
        const token = useAuthStore.getState().accessToken;
        if (token) {
          // If this was triggered by a fill, we don't create a new MARKET order.
          // The monitor already marked the original limit/stop order as FILLED.
          const syncPromise = relatedOrderId
            ? Promise.resolve({ id: relatedOrderId }) // Already exists
            : paperApi.createOrder(
                {
                  refId: id,
                  symbol,
                  side: side === 'buy' ? 'BUY' : 'SELL',
                  orderType: 'MARKET',
                  quantity: quantity.toString(),
                  limitPrice: price.toString(),
                  takeProfit: takeProfit?.toString(),
                  stopLoss: stopLoss?.toString(),
                  margin: usdtAmount.toString(),
                },
                token
              );

          syncPromise
            .then((res) => {
              // Keep local position IDs stable; server routes support lookup via refId.
              set((s) => ({
                orders: s.orders.map((o) => (o.id === `o-${id}` ? { ...o, id: `o-${res.id}` } : o)),
              }));

              // Explicitly create the position on the server.
              // This is now required because the server's POST /orders no longer has side-effects.
              return paperApi.createPosition(
                {
                  refId: id,
                  symbol,
                  side: (side === 'buy' ? 'LONG' : 'SHORT') as 'LONG' | 'SHORT',
                  quantity: quantity.toString(),
                  entryPrice: price.toString(),
                  margin: usdtAmount.toString(),
                  takeProfit: takeProfit?.toString() ?? null,
                  stopLoss: stopLoss?.toString() ?? null,
                },
                token
              );
            })
            .then(() => {
              // Sync final balance stats to account for commission/margin accurately
              const state = get();
              return paperApi.updateAccount(
                {
                  totalBalance: (state.balance + state.realizedPnl).toString(),
                  availableBalance: state.balance.toString(),
                },
                token
              );
            })
            .catch((e) => {
              if (import.meta.env.DEV) console.error('Failed to sync order/position to server:', e);
            });
        }

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

        const siblingCancelOrders: HistoricalOrder[] = [];
        const pushCancelExit = (exitType: 'take-profit' | 'stop-loss', price: number) => {
          siblingCancelOrders.push({
            id: `o-cancel-${exitType}-${positionId}-${now}`,
            symbol: pos.symbol,
            side: pos.side === 'long' ? 'sell' : 'buy',
            type: exitType,
            qty: pos.quantity,
            ...(exitType === 'take-profit' ? { limitPrice: price } : { stopPrice: price }),
            status: 'cancelled',
            commission: 0,
            placingTime: pos.openedAt,
            closingTime: now,
          });
        };

        if (closeType === 'take-profit') {
          if (pos.stopLoss) pushCancelExit('stop-loss', pos.stopLoss);
        } else if (closeType === 'stop-loss') {
          if (pos.takeProfit) pushCancelExit('take-profit', pos.takeProfit);
        } else {
          // Manual close (or generic close) cancels all remaining exit legs.
          if (pos.takeProfit) pushCancelExit('take-profit', pos.takeProfit);
          if (pos.stopLoss) pushCancelExit('stop-loss', pos.stopLoss);
        }

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
          closingJournalEntries.push(
            createSystemJournalEntry({
              id: `j-close-${closedId}-reason`,
              time: now,
              text: reason,
              pnl: netPnl,
            })
          );
        } else {
          // Manual close — generic "Closed" entry with PnL badge
          const closedSide = pos.side === 'long' ? 'LONG' : 'SHORT';
          closingJournalEntries.push(
            createSystemJournalEntry({
              id: `j-close-${closedId}-exec`,
              time: now,
              text: `Closed ${closedSide} ${pos.symbol} @ $${fmtPrice(exitPrice)}`,
              pnl: netPnl,
            })
          );
        }

        set((s) => ({
          balance: s.balance + returnAmount,
          positions: s.positions.filter((p) => p.id !== positionId),
          history: [closed, ...s.history].slice(0, MAX_HISTORY),
          orders: [closingOrder, ...siblingCancelOrders, ...s.orders].slice(0, MAX_HISTORY * 2),
          realizedPnl: s.realizedPnl + pnl - commission - entryCommission,
          balanceLog: [logEntry, ...s.balanceLog].slice(0, MAX_HISTORY * 2),
          journal: [...closingJournalEntries, ...s.journal].slice(0, MAX_JOURNAL),
        }));

        // ── Server Sync ──────────────────────────────────────────────────
        const token = useAuthStore.getState().accessToken;
        if (token) {
          // Record the closing trade
          paperApi
            .recordTrade(
              {
                refId: closedId, // refId for the trade
                symbol: pos.symbol,
                side: pos.side === 'long' ? 'SELL' : 'BUY',
                quantity: pos.quantity.toString(),
                executedPrice: exitPrice.toString(),
                entryPrice: pos.entryPrice.toString(),
                totalCost: (pos.quantity * exitPrice).toString(),
                commission: commission.toString(),
                pnl: netPnl.toString(),
                pnlPercent: (netPnl / pos.entryUsdtAmount).toString(),
                orderId: positionId, // Use positionId (could be refId or DB ID)
                openedAt: new Date(pos.openedAt).toISOString(),
              },
              token
            )
            .then(() => {
              // Server supports deleting by either DB id or refId.
              return paperApi.deletePosition(positionId, token);
            })
            .then(() => {
              const state = get();
              return paperApi.updateAccount(
                {
                  totalBalance: (state.balance + state.realizedPnl).toString(),
                  availableBalance: state.balance.toString(),
                  realizedPnl: state.realizedPnl.toString(),
                },
                token
              );
            })
            .catch((e) => {
              if (import.meta.env.DEV) console.error('Failed to sync close position to server:', e);
            });
        }
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
          leverage: 1,
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

        const placementSide = side === 'buy' ? 'Long' : 'Short';
        const placementNote = createSystemJournalEntry({
          id: `j-place-limit-${id}`,
          time: now,
          text:
            `Placed LIMIT ${placementSide} ${symbol} @ $${fmtPrice(triggerPrice)}` +
            ` (qty: ${qty.toFixed(6)}, reserved: $${usdtAmount.toFixed(2)})`,
        });

        set((s) => ({
          balance: s.balance - totalCost,
          pendingOrders: [...s.pendingOrders, pending],
          journal: [placementNote, ...s.journal].slice(0, MAX_JOURNAL),
        }));

        // ── Server Sync ──────────────────────────────────────────────────
        const token = useAuthStore.getState().accessToken;
        if (token) {
          paperApi
            .createOrder(
              {
                refId: id,
                symbol,
                side: (side === 'buy' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
                orderType: 'LIMIT',
                quantity: qty.toString(),
                limitPrice: triggerPrice.toString(),
                takeProfit: takeProfit?.toString(),
                stopLoss: stopLoss?.toString(),
                margin: usdtAmount.toString(),
              },
              token
            )
            .catch((e) => {
              if (import.meta.env.DEV) console.error('Failed to sync limit order:', e);
            });
        }

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

        const stopPlacementSide = side === 'buy' ? 'Long' : 'Short';
        const stopPlacementNote = createSystemJournalEntry({
          id: `j-place-stop-${id}`,
          time: now,
          text:
            `Placed STOP ${stopPlacementSide} ${symbol} @ $${fmtPrice(triggerPrice)}` +
            ` (qty: ${qty.toFixed(6)}, reserved: $${usdtAmount.toFixed(2)})`,
        });

        set((s) => ({
          balance: s.balance - totalCost,
          pendingOrders: [...s.pendingOrders, pending],
          journal: [stopPlacementNote, ...s.journal].slice(0, MAX_JOURNAL),
        }));

        // ── Server Sync ────���─────────────────────────────────────────────
        const token = useAuthStore.getState().accessToken;
        if (token) {
          paperApi
            .createOrder(
              {
                refId: id,
                symbol,
                side: (side === 'buy' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
                orderType: 'STOP',
                quantity: qty.toString(),
                stopPrice: triggerPrice.toString(),
                takeProfit: takeProfit?.toString(),
                stopLoss: stopLoss?.toString(),
                margin: usdtAmount.toString(),
              },
              token
            )
            .catch((e) => {
              if (import.meta.env.DEV) console.error('Failed to sync stop order:', e);
            });
        }

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

        const childCancelledOrders: HistoricalOrder[] = [];
        if (order.takeProfit) {
          childCancelledOrders.push({
            id: `o-cancel-tp-${orderId}`,
            symbol: order.symbol,
            side: order.side === 'buy' ? 'sell' : 'buy',
            type: 'take-profit',
            qty: order.qty,
            limitPrice: order.takeProfit,
            status: 'cancelled',
            commission: 0,
            placingTime: order.placedAt,
            closingTime: now,
          });
        }
        if (order.stopLoss) {
          childCancelledOrders.push({
            id: `o-cancel-sl-${orderId}`,
            symbol: order.symbol,
            side: order.side === 'buy' ? 'sell' : 'buy',
            type: 'stop-loss',
            qty: order.qty,
            stopPrice: order.stopLoss,
            status: 'cancelled',
            commission: 0,
            placingTime: order.placedAt,
            closingTime: now,
          });
        }

        const cancelTypeLabel = order.type === 'limit' ? 'LIMIT' : 'STOP';
        const cancelSideLabel = order.side === 'buy' ? 'Long' : 'Short';
        const cancelNote = createSystemJournalEntry({
          id: `j-cancel-pending-${orderId}-${now}`,
          time: now,
          text:
            `Cancelled ${cancelTypeLabel} ${cancelSideLabel} ${order.symbol} @ $${fmtPrice(order.triggerPrice)}` +
            ` (refunded: $${refund.toFixed(2)})`,
        });

        set((s) => ({
          balance: s.balance + refund,
          pendingOrders: s.pendingOrders.filter((o) => o.id !== orderId),
          orders: [cancelledOrder, ...childCancelledOrders, ...s.orders].slice(0, MAX_HISTORY * 2),
          journal: [cancelNote, ...s.journal].slice(0, MAX_JOURNAL),
        }));

        // ── Server Sync ──────────────────────────────────────────────────
        const token = useAuthStore.getState().accessToken;
        if (token) {
          // !orderId.includes('-') was a heuristic for server-side cuid vs local random ID.
          // Now the server handles both via refId lookup.
          paperApi.updateOrder(orderId, { status: 'CANCELLED' }, token).catch((e) => {
            if (import.meta.env.DEV) console.error('Failed to cancel order on server:', e);
          });
        }
      },

      cancelExitOrder: (positionId, exitType) => {
        const { positions } = get();
        const pos = positions.find((p) => p.id === positionId);
        if (!pos) return;

        const targetPrice = exitType === 'take-profit' ? pos.takeProfit : pos.stopLoss;
        if (!targetPrice) return;

        const now = Date.now();
        const cancelRow: HistoricalOrder = {
          id: `o-cancel-${exitType}-${positionId}-${now}`,
          symbol: pos.symbol,
          side: pos.side === 'long' ? 'sell' : 'buy',
          type: exitType,
          qty: pos.quantity,
          ...(exitType === 'take-profit'
            ? { limitPrice: targetPrice }
            : { stopPrice: targetPrice }),
          status: 'cancelled',
          commission: 0,
          placingTime: pos.openedAt,
          closingTime: now,
        };

        const note = createSystemJournalEntry({
          id: `j-cancel-${exitType}-${positionId}-${now}`,
          time: now,
          text:
            `${exitType === 'take-profit' ? 'Take-Profit' : 'Stop-Loss'} cancelled for ` +
            `${pos.side.toUpperCase()} ${pos.symbol} @ $${fmtPrice(targetPrice)}`,
        });

        set((s) => ({
          positions: s.positions.map((p) => {
            if (p.id !== positionId) return p;
            return exitType === 'take-profit'
              ? { ...p, takeProfit: undefined }
              : { ...p, stopLoss: undefined };
          }),
          orders: [cancelRow, ...s.orders].slice(0, MAX_HISTORY * 2),
          journal: [note, ...s.journal].slice(0, MAX_JOURNAL),
        }));

        // ── Server Sync ──────────────────────────────────────────────────
        const token = useAuthStore.getState().accessToken;
        if (token) {
          const body = exitType === 'take-profit' ? { takeProfit: null } : { stopLoss: null };
          paperApi.updatePosition(positionId, body, token).catch((e) => {
            if (import.meta.env.DEV) console.error('Failed to update position exits on server:', e);
          });
        }
      },

      cancelPendingExitLeg: (pendingOrderId, exitType) => {
        const { pendingOrders } = get();
        const order = pendingOrders.find((o) => o.id === pendingOrderId);
        if (!order) return;

        const targetPrice = exitType === 'take-profit' ? order.takeProfit : order.stopLoss;
        if (!targetPrice) return;

        const now = Date.now();
        const cancelRow: HistoricalOrder = {
          id: `o-cancel-pending-${exitType}-${pendingOrderId}-${now}`,
          symbol: order.symbol,
          side: order.side === 'buy' ? 'sell' : 'buy',
          type: exitType,
          qty: order.qty,
          ...(exitType === 'take-profit'
            ? { limitPrice: targetPrice }
            : { stopPrice: targetPrice }),
          status: 'cancelled',
          commission: 0,
          placingTime: order.placedAt,
          closingTime: now,
        };

        const pendingSide = order.side === 'buy' ? 'Long' : 'Short';
        const note = createSystemJournalEntry({
          id: `j-cancel-pending-${exitType}-${pendingOrderId}-${now}`,
          time: now,
          text:
            `${exitType === 'take-profit' ? 'Take-Profit' : 'Stop-Loss'} cancelled for ` +
            `pending ${pendingSide} ${order.symbol} @ $${fmtPrice(targetPrice)}`,
        });

        set((s) => ({
          pendingOrders: s.pendingOrders.map((o) => {
            if (o.id !== pendingOrderId) return o;
            return exitType === 'take-profit'
              ? { ...o, takeProfit: undefined }
              : { ...o, stopLoss: undefined };
          }),
          orders: [cancelRow, ...s.orders].slice(0, MAX_HISTORY * 2),
          journal: [note, ...s.journal].slice(0, MAX_JOURNAL),
        }));

        // ── Server Sync ──────────────────────────────────────────────────
        const token = useAuthStore.getState().accessToken;
        if (token) {
          const body = exitType === 'take-profit' ? { takeProfit: null } : { stopLoss: null };
          paperApi.updateOrder(pendingOrderId, body, token).catch((e) => {
            if (import.meta.env.DEV)
              console.error('Failed to update pending order exits on server:', e);
          });
        }
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

        // ── Server Sync ────────────────────────────────────────────��─────
        const token = useAuthStore.getState().accessToken;
        if (token) {
          paperApi.updateOrder(orderId, { status: 'FILLED' }, token).catch((e) => {
            if (import.meta.env.DEV) console.error('Failed to mark order filled on server:', e);
          });
        }
      },

      updatePositionExits: (positionId, takeProfit, stopLoss) => {
        const { positions } = get();
        const pos = positions.find((p) => p.id === positionId);
        if (!pos) return;

        const now = Date.now();
        const cancelRows: HistoricalOrder[] = [];

        // Only write cancel records when a leg is explicitly REMOVED (value → null).
        // Editing to a new price is a silent in-place update  no cancel record needed.
        // Use !! to handle both undefined and null (loose != null fails when value is undefined).
        const tpRemoving = takeProfit === null && !!pos.takeProfit;
        const slRemoving = stopLoss === null && !!pos.stopLoss;

        if (tpRemoving) {
          cancelRows.push({
            id: `o-cancel-tp-edit-${positionId}-${now}`,
            symbol: pos.symbol,
            side: pos.side === 'long' ? 'sell' : 'buy',
            type: 'take-profit',
            qty: pos.quantity,
            limitPrice: pos.takeProfit,
            status: 'cancelled',
            commission: 0,
            placingTime: pos.openedAt,
            closingTime: now,
          });
        }
        if (slRemoving) {
          cancelRows.push({
            id: `o-cancel-sl-edit-${positionId}-${now}`,
            symbol: pos.symbol,
            side: pos.side === 'long' ? 'sell' : 'buy',
            type: 'stop-loss',
            qty: pos.quantity,
            stopPrice: pos.stopLoss,
            status: 'cancelled',
            commission: 0,
            placingTime: pos.openedAt,
            closingTime: now,
          });
        }

        const journalEntries = buildPositionExitJournalEntries(pos, takeProfit, stopLoss, now);

        set((s) => ({
          positions: s.positions.map((p) => {
            if (p.id !== positionId) return p;
            const updated = { ...p };
            if (takeProfit != null) updated.takeProfit = takeProfit;
            else delete updated.takeProfit;
            if (stopLoss != null) updated.stopLoss = stopLoss;
            else delete updated.stopLoss;
            return updated;
          }),
          orders: cancelRows.length
            ? [...cancelRows, ...s.orders].slice(0, MAX_HISTORY * 2)
            : s.orders,
          journal: journalEntries.length
            ? [...journalEntries, ...s.journal].slice(0, MAX_JOURNAL)
            : s.journal,
        }));

        // ── Server Sync ──────────────────────────────────────────────────
        const token = useAuthStore.getState().accessToken;
        if (token) {
          paperApi
            .updatePosition(
              positionId,
              {
                takeProfit: takeProfit?.toString() ?? null,
                stopLoss: stopLoss?.toString() ?? null,
              },
              token
            )
            .catch((e) => {
              if (import.meta.env.DEV)
                console.error('Failed to update position exits on server:', e);
            });
        }
      },

      editPendingOrder: (orderId, newTriggerPrice, newUsdtAmount, newTakeProfit, newStopLoss) => {
        const { pendingOrders, balance, leverage } = get();
        const order = pendingOrders.find((o) => o.id === orderId);
        if (!order) return 'not-found';

        const now = Date.now();
        const oldReserved = order.usdtAmount + order.usdtAmount * COMMISSION_RATE;
        const scratchBalance = balance + oldReserved;
        const newRequired = newUsdtAmount + newUsdtAmount * COMMISSION_RATE;

        if (newRequired > scratchBalance) {
          // ── Insufficient funds — reject + cancel children ─��───────────────
          const rejectedOrder: HistoricalOrder = {
            id: `o-rej-edit-${orderId}-${now}`,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            qty: newTriggerPrice > 0 ? (newUsdtAmount * leverage) / newTriggerPrice : order.qty,
            ...(order.type === 'limit'
              ? { limitPrice: newTriggerPrice }
              : { stopPrice: newTriggerPrice }),
            status: 'rejected',
            commission: 0,
            margin: newUsdtAmount,
            placingTime: order.placedAt,
            closingTime: now,
            rejectionReason: 'Not enough funds to complete the order.',
          };

          const childCancels: HistoricalOrder[] = [];
          if (order.takeProfit) {
            childCancels.push({
              id: `o-cancel-tp-rej-${orderId}-${now}`,
              symbol: order.symbol,
              side: order.side === 'buy' ? 'sell' : 'buy',
              type: 'take-profit',
              qty: order.qty,
              limitPrice: order.takeProfit,
              status: 'cancelled',
              commission: 0,
              placingTime: order.placedAt,
              closingTime: now,
            });
          }
          if (order.stopLoss) {
            childCancels.push({
              id: `o-cancel-sl-rej-${orderId}-${now}`,
              symbol: order.symbol,
              side: order.side === 'buy' ? 'sell' : 'buy',
              type: 'stop-loss',
              qty: order.qty,
              stopPrice: order.stopLoss,
              status: 'cancelled',
              commission: 0,
              placingTime: order.placedAt,
              closingTime: now,
            });
          }

          const typeLabel = order.type === 'limit' ? 'LIMIT' : 'STOP';
          const sideLabel = order.side === 'buy' ? 'Long' : 'Short';
          const journalEntries: JournalEntry[] = [
            createSystemJournalEntry({
              id: `j-rej-edit-${orderId}-${now}`,
              time: now,
              text: `${typeLabel} ${sideLabel} ${order.symbol} order rejected — Not enough funds ($${newUsdtAmount.toFixed(2)} required, $${scratchBalance.toFixed(2)} available)`,
            }),
            ...(order.takeProfit
              ? [
                  createSystemJournalEntry({
                    id: `j-cancel-tp-rej-${orderId}-${now}`,
                    time: now,
                    text: `Take-Profit cancelled for pending ${sideLabel} ${order.symbol} @ $${fmtPrice(order.takeProfit)}`,
                  }),
                ]
              : []),
            ...(order.stopLoss
              ? [
                  createSystemJournalEntry({
                    id: `j-cancel-sl-rej-${orderId}-${now}`,
                    time: now,
                    text: `Stop-Loss cancelled for pending ${sideLabel} ${order.symbol} @ $${fmtPrice(order.stopLoss)}`,
                  }),
                ]
              : []),
          ];

          set((s) => ({
            balance: s.balance + oldReserved, // refund the original reserved amount
            pendingOrders: s.pendingOrders.filter((o) => o.id !== orderId),
            orders: [rejectedOrder, ...childCancels, ...s.orders].slice(0, MAX_HISTORY * 2),
            journal: [...journalEntries, ...s.journal].slice(0, MAX_JOURNAL),
          }));

          return 'rejected';
        }

        // ── Valid edit — update in-place ────────────────────────────────────
        const newQty =
          newTriggerPrice > 0 ? (newUsdtAmount * leverage) / newTriggerPrice : order.qty;
        const balanceDelta = oldReserved - newRequired; // positive = freed up, negative = cost more

        // Write cancel records for any exit leg that is being explicitly removed.
        const tpRemoving = newTakeProfit === null && !!order.takeProfit;
        const slRemoving = newStopLoss === null && !!order.stopLoss;
        const exitCancelOrders: HistoricalOrder[] = [];
        if (tpRemoving) {
          exitCancelOrders.push({
            id: `o-cancel-tp-edit-pending-${orderId}-${now}`,
            symbol: order.symbol,
            side: order.side === 'buy' ? 'sell' : 'buy',
            type: 'take-profit',
            qty: order.qty,
            limitPrice: order.takeProfit,
            status: 'cancelled',
            commission: 0,
            placingTime: order.placedAt,
            closingTime: now,
          });
        }
        if (slRemoving) {
          exitCancelOrders.push({
            id: `o-cancel-sl-edit-pending-${orderId}-${now}`,
            symbol: order.symbol,
            side: order.side === 'buy' ? 'sell' : 'buy',
            type: 'stop-loss',
            qty: order.qty,
            stopPrice: order.stopLoss,
            status: 'cancelled',
            commission: 0,
            placingTime: order.placedAt,
            closingTime: now,
          });
        }

        const journalEntries = buildPendingOrderEditJournalEntries(
          order,
          newTriggerPrice,
          newUsdtAmount,
          newQty,
          newTakeProfit,
          newStopLoss,
          now
        );

        set((s) => ({
          balance: s.balance + balanceDelta,
          pendingOrders: s.pendingOrders.map((o) => {
            if (o.id !== orderId) return o;
            return {
              ...o,
              triggerPrice: newTriggerPrice,
              usdtAmount: newUsdtAmount,
              qty: newQty,
              ...(newTakeProfit != null
                ? { takeProfit: newTakeProfit }
                : { takeProfit: undefined }),
              ...(newStopLoss != null ? { stopLoss: newStopLoss } : { stopLoss: undefined }),
            };
          }),
          orders: exitCancelOrders.length
            ? [...exitCancelOrders, ...s.orders].slice(0, MAX_HISTORY * 2)
            : s.orders,
          journal: journalEntries.length
            ? [...journalEntries, ...s.journal].slice(0, MAX_JOURNAL)
            : s.journal,
        }));

        // ── Server Sync ──────────────────────────────────────────────────
        const token = useAuthStore.getState().accessToken;
        if (token) {
          const isLimit = order.type === 'limit';
          paperApi
            .updateOrder(
              orderId,
              {
                limitPrice: isLimit ? newTriggerPrice.toString() : undefined,
                stopPrice: !isLimit ? newTriggerPrice.toString() : undefined,
                margin: newUsdtAmount.toString(),
                quantity: newQty.toString(),
                takeProfit: newTakeProfit?.toString() ?? null,
                stopLoss: newStopLoss?.toString() ?? null,
              },
              token
            )
            .catch((e) => {
              if (import.meta.env.DEV)
                console.error('Failed to update pending order on server:', e);
            });
        }

        return 'ok';
      },
    }),
    {
      name: 'cd-paper-trading', // localStorage key
      partialize: (state) => ({
        balance: state.balance,
        positions: state.positions,
        pendingOrders: state.pendingOrders,
        history: state.history,
        orders: state.orders,
        realizedPnl: state.realizedPnl,
        balanceLog: state.balanceLog,
        journal: state.journal,
        leverage: state.leverage,
      }),
      // 🔐 version + migrate: any malformed or tampered localStorage snapshot from an
      //    older schema is safely discarded (migrate returns fresh state) instead of
      //    crashing the app on hydration. Increment `version` whenever a new required
      //    state field is added so old snapshots are migrated rather than used as-is.
      version: 3,
      migrate: (persisted: unknown, fromVersion: number) => {
        // ── Fresh-state fallback ───────────────────────────────────────────
        // Used when the snapshot is completely unrecognisable (null, non-object,
        // or missing the minimum fields we need to trust it).
        const fresh = {
          balance: STARTING_BALANCE,
          positions: [] as Position[],
          pendingOrders: [] as PendingOrder[],
          history: [] as ClosedTrade[],
          orders: [] as HistoricalOrder[],
          realizedPnl: 0,
          balanceLog: [] as BalanceEvent[],
          journal: [] as JournalEntry[],
          leverage: 1,
        };

        if (!persisted || typeof persisted !== 'object') return fresh;
        const p = persisted as Record<string, unknown>;

        // ── v0 → v1 ───────────────────────────────────────────────────────────
        // v0 had: balance, positions, history, realizedPnl
        // v1 adds: pendingOrders, orders, balanceLog, journal, leverage
        // Preserve every valid v0 field; fill missing v1 fields with defaults.
        if (fromVersion === 0) {
          return {
            balance:
              typeof p['balance'] === 'number' && Number.isFinite(p['balance']) && p['balance'] >= 0
                ? p['balance']
                : STARTING_BALANCE,
            positions: Array.isArray(p['positions'])
              ? p['positions'].filter(isPositionSnapshot)
              : [],
            history: Array.isArray(p['history']) ? p['history'].filter(isClosedTradeSnapshot) : [],
            realizedPnl: typeof p['realizedPnl'] === 'number' ? p['realizedPnl'] : 0,
            // Fields added in v1 — not present in v0 snapshots
            pendingOrders: [],
            orders: [],
            balanceLog: [],
            journal: [],
            leverage: 1,
          };
        }

        // ── v1 → v2 ───────────────────────────────────────────────────────────
        // v2 caps leverage at MAX_LEVERAGE (10×). Any user who had saved a higher
        // leverage value in localStorage will be silently clamped to 10 on hydration.
        // Also validates defensively — NaN/Infinity/0/negative values from a corrupted
        // snapshot are rejected and replaced with the safe default of 1.
        if (fromVersion === 1) {
          const rawLeverage = typeof p['leverage'] === 'number' ? p['leverage'] : 1;
          const leverage =
            Number.isFinite(rawLeverage) && rawLeverage >= 1
              ? Math.min(Math.round(rawLeverage), MAX_LEVERAGE)
              : 1;
          return {
            balance:
              typeof p['balance'] === 'number' && Number.isFinite(p['balance']) && p['balance'] >= 0
                ? p['balance']
                : STARTING_BALANCE,
            positions: Array.isArray(p['positions'])
              ? p['positions'].filter(isPositionSnapshot)
              : [],
            history: Array.isArray(p['history']) ? p['history'].filter(isClosedTradeSnapshot) : [],
            realizedPnl:
              typeof p['realizedPnl'] === 'number' && Number.isFinite(p['realizedPnl'])
                ? p['realizedPnl']
                : 0,
            pendingOrders: Array.isArray(p['pendingOrders'])
              ? p['pendingOrders'].filter(isPendingOrderSnapshot)
              : [],
            orders: Array.isArray(p['orders']) ? p['orders'].filter(isHistoricalOrderSnapshot) : [],
            balanceLog: Array.isArray(p['balanceLog'])
              ? p['balanceLog'].filter(isBalanceEventSnapshot)
              : [],
            journal: Array.isArray(p['journal']) ? p['journal'].filter(isJournalEntrySnapshot) : [],
            leverage,
          };
        }

        // ── v2 → v3 ───────────────────────────────────────────────────────────
        // v3 strips `isSyncing` and `lastSyncAt` from persisted state — these
        // are transient runtime fields that should never survive a page refresh.
        if (fromVersion === 2) {
          return {
            balance:
              typeof p['balance'] === 'number' && Number.isFinite(p['balance']) && p['balance'] >= 0
                ? p['balance']
                : STARTING_BALANCE,
            positions: Array.isArray(p['positions'])
              ? p['positions'].filter(isPositionSnapshot)
              : [],
            pendingOrders: Array.isArray(p['pendingOrders'])
              ? p['pendingOrders'].filter(isPendingOrderSnapshot)
              : [],
            history: Array.isArray(p['history']) ? p['history'].filter(isClosedTradeSnapshot) : [],
            orders: Array.isArray(p['orders']) ? p['orders'].filter(isHistoricalOrderSnapshot) : [],
            realizedPnl:
              typeof p['realizedPnl'] === 'number' && Number.isFinite(p['realizedPnl'])
                ? p['realizedPnl']
                : 0,
            balanceLog: Array.isArray(p['balanceLog'])
              ? p['balanceLog'].filter(isBalanceEventSnapshot)
              : [],
            journal: Array.isArray(p['journal']) ? p['journal'].filter(isJournalEntrySnapshot) : [],
            leverage:
              typeof p['leverage'] === 'number' &&
              Number.isFinite(p['leverage']) &&
              p['leverage'] >= 1
                ? Math.min(Math.round(p['leverage']), MAX_LEVERAGE)
                : 1,
          };
        }

        // Unknown future version or unrecognised shape → fresh state
        return fresh;
      },
    }
  )
);
