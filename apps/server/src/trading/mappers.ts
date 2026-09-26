/**
 * Mapping between database rows, engine types and the SDK wire DTOs (BYBIT_PARITY_PLAN BP-1).
 *
 * Rows written by the pre-BP-1 browser engine carry the browser's id in `refId`. The engine
 * addresses them by that id, so `refId ?? id` is the public id everywhere.
 */

import { Decimal } from '@prisma/client/runtime/client';
import type {
  PaperBalanceEventDTO,
  PaperDeltaDTO,
  PaperJournalEntryDTO,
  PaperOrderDTO,
  PaperPendingOrderDTO,
  PaperPositionDTO,
  PaperTradeDTO,
} from '@crypto-dashboard/sdk';
import type {
  BalanceEvent,
  ClosedTrade,
  Delta,
  HistoricalOrder,
  JournalEntry,
  OrderType,
  PendingOrder,
  Position,
} from './engine/index.js';

// ─── Row shapes (the Prisma model fields the mappers read) ────────────────────

type Dec = Decimal | { toString(): string };

export interface PositionRow {
  id: string;
  refId: string | null;
  symbol: string;
  side: string;
  quantity: Dec;
  entryPrice: Dec;
  margin: Dec;
  takeProfit: Dec | null;
  stopLoss: Dec | null;
  openedAt: Date;
}

export interface OrderRow {
  id: string;
  refId: string | null;
  symbol: string;
  side: string;
  orderType: string;
  quantity: Dec;
  limitPrice: Dec | null;
  stopPrice: Dec | null;
  takeProfit: Dec | null;
  stopLoss: Dec | null;
  averageFilledPrice: Dec | null;
  margin: Dec;
  commission: Dec;
  leverage: number;
  status: string;
  rejectionReason: string | null;
  createdAt: Date;
  filledAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;
}

export interface TradeRow {
  id: string;
  refId: string | null;
  symbol: string;
  side: string;
  quantity: Dec;
  executedPrice: Dec;
  entryPrice: Dec | null;
  pnl: Dec;
  grossPnl: Dec | null;
  openedAt: Date | null;
  executedAt: Date;
}

export interface JournalRow {
  id: string;
  time: Date;
  text: string;
  isUserNote: boolean;
  pnl: Dec | null;
}

export interface BalanceEventRow {
  id: string;
  time: Date;
  balanceBefore: Dec;
  balanceAfter: Dec;
  pnl: Dec;
  action: string;
}

const d = (v: Dec) => new Decimal(v.toString());
const optD = (v: Dec | null) => (v === null ? undefined : d(v));

// ─── DB row → engine ───────────────────────────────────────────────────────────

const ORDER_TYPE_FROM_DB: Record<string, OrderType> = {
  MARKET: 'market',
  LIMIT: 'limit',
  STOP: 'stop',
  TAKE_PROFIT: 'take-profit',
  STOP_LOSS: 'stop-loss',
};

const ORDER_TYPE_TO_DB: Record<OrderType, string> = {
  market: 'MARKET',
  limit: 'LIMIT',
  stop: 'STOP',
  'take-profit': 'TAKE_PROFIT',
  'stop-loss': 'STOP_LOSS',
};

export function positionFromRow(r: PositionRow): Position {
  const tp = optD(r.takeProfit);
  const sl = optD(r.stopLoss);
  return {
    id: r.refId ?? r.id,
    symbol: r.symbol,
    side: r.side === 'SHORT' ? 'short' : 'long',
    quantity: d(r.quantity),
    entryPrice: d(r.entryPrice),
    entryUsdtAmount: d(r.margin),
    openedAt: r.openedAt.getTime(),
    ...(tp ? { takeProfit: tp } : {}),
    ...(sl ? { stopLoss: sl } : {}),
  };
}

export function pendingFromRow(r: OrderRow): PendingOrder {
  const tp = optD(r.takeProfit);
  const sl = optD(r.stopLoss);
  const trigger = r.orderType === 'STOP' ? r.stopPrice : r.limitPrice;
  return {
    id: r.refId ?? r.id,
    symbol: r.symbol,
    side: r.side === 'SELL' ? 'sell' : 'buy',
    type: r.orderType === 'STOP' ? 'stop' : 'limit',
    usdtAmount: d(r.margin),
    triggerPrice: d(trigger ?? r.limitPrice ?? r.stopPrice ?? '0'),
    qty: d(r.quantity),
    leverage: r.leverage,
    placedAt: r.createdAt.getTime(),
    ...(tp ? { takeProfit: tp } : {}),
    ...(sl ? { stopLoss: sl } : {}),
  };
}

export function historyOrderFromRow(r: OrderRow): PaperOrderDTO {
  const margin = d(r.margin);
  const closing = r.filledAt ?? r.cancelledAt ?? r.updatedAt;
  return {
    id: r.refId ?? r.id,
    symbol: r.symbol,
    side: r.side === 'SELL' ? 'sell' : 'buy',
    type: ORDER_TYPE_FROM_DB[r.orderType] ?? 'market',
    qty: d(r.quantity).toString(),
    ...(r.limitPrice !== null ? { limitPrice: d(r.limitPrice).toString() } : {}),
    ...(r.stopPrice !== null ? { stopPrice: d(r.stopPrice).toString() } : {}),
    ...(r.averageFilledPrice !== null ? { fillPrice: d(r.averageFilledPrice).toString() } : {}),
    status:
      r.status === 'CANCELLED' ? 'cancelled' : r.status === 'REJECTED' ? 'rejected' : 'filled',
    commission: d(r.commission).toString(),
    ...(margin.gt(0) ? { margin: margin.toString() } : {}),
    placingTime: r.createdAt.getTime(),
    closingTime: closing.getTime(),
    ...(r.rejectionReason ? { rejectionReason: r.rejectionReason } : {}),
  };
}

export function tradeFromRow(r: TradeRow): PaperTradeDTO {
  return {
    id: r.refId ?? r.id,
    symbol: r.symbol,
    // The trade row stores the closing side: SELL closed a long, BUY closed a short
    side: r.side === 'BUY' ? 'short' : 'long',
    quantity: d(r.quantity).toString(),
    entryPrice: (r.entryPrice ? d(r.entryPrice) : new Decimal(0)).toString(),
    exitPrice: d(r.executedPrice).toString(),
    pnl: d(r.grossPnl ?? r.pnl).toString(),
    openedAt: r.openedAt?.getTime() ?? 0,
    closedAt: r.executedAt.getTime(),
  };
}

export function journalFromRow(r: JournalRow): PaperJournalEntryDTO {
  return {
    id: r.id,
    time: r.time.getTime(),
    text: r.text,
    isUserNote: r.isUserNote,
    ...(r.pnl !== null ? { pnl: d(r.pnl).toString() } : {}),
  };
}

export function balanceEventFromRow(r: BalanceEventRow): PaperBalanceEventDTO {
  return {
    id: r.id,
    time: r.time.getTime(),
    balanceBefore: d(r.balanceBefore).toString(),
    balanceAfter: d(r.balanceAfter).toString(),
    pnl: d(r.pnl).toString(),
    action: r.action,
  };
}

// ─── Engine → DB row data ──────────────────────────────────────────────────────

const orderSideToDb = (side: 'buy' | 'sell') => (side === 'buy' ? 'BUY' : 'SELL');

export function positionData(p: Position) {
  return {
    symbol: p.symbol,
    side: p.side === 'long' ? 'LONG' : 'SHORT',
    quantity: p.quantity,
    entryPrice: p.entryPrice,
    margin: p.entryUsdtAmount,
    takeProfit: p.takeProfit ?? null,
    stopLoss: p.stopLoss ?? null,
    openedAt: new Date(p.openedAt),
  };
}

export function pendingData(o: PendingOrder) {
  return {
    symbol: o.symbol,
    side: orderSideToDb(o.side),
    orderType: o.type === 'limit' ? 'LIMIT' : 'STOP',
    quantity: o.qty,
    limitPrice: o.type === 'limit' ? o.triggerPrice : null,
    stopPrice: o.type === 'stop' ? o.triggerPrice : null,
    takeProfit: o.takeProfit ?? null,
    stopLoss: o.stopLoss ?? null,
    margin: o.usdtAmount,
    leverage: o.leverage,
    status: 'PENDING',
    createdAt: new Date(o.placedAt),
  };
}

export function historyOrderData(o: HistoricalOrder) {
  const closedAt = new Date(o.closingTime);
  return {
    symbol: o.symbol,
    side: orderSideToDb(o.side),
    orderType: ORDER_TYPE_TO_DB[o.type],
    quantity: o.qty,
    limitPrice: o.limitPrice ?? null,
    stopPrice: o.stopPrice ?? null,
    averageFilledPrice: o.fillPrice ?? null,
    filledQuantity: o.status === 'filled' ? o.qty : new Decimal(0),
    margin: o.margin ?? new Decimal(0),
    commission: o.commission,
    leverage: o.leverage ?? 1,
    status: o.status.toUpperCase(),
    rejectionReason: o.rejectionReason ?? null,
    createdAt: new Date(o.placingTime),
    filledAt: o.status === 'filled' ? closedAt : null,
    cancelledAt: o.status === 'filled' ? null : closedAt,
  };
}

/** pnlPercent column is Decimal(12,4): a ratio, clamped so an extreme trade can't overflow it. */
const PNL_PERCENT_LIMIT = new Decimal('99999999');

export function tradeData(t: ClosedTrade) {
  const net = t.pnl.minus(t.exitCommission);
  const ratio = t.margin.gt(0) ? net.div(t.margin) : new Decimal(0);
  return {
    symbol: t.symbol,
    side: t.side === 'long' ? 'SELL' : 'BUY',
    quantity: t.quantity,
    executedPrice: t.exitPrice,
    entryPrice: t.entryPrice,
    totalCost: t.quantity.times(t.exitPrice),
    commission: t.exitCommission,
    pnl: net,
    grossPnl: t.pnl,
    pnlPercent: Decimal.max(
      PNL_PERCENT_LIMIT.neg(),
      Decimal.min(PNL_PERCENT_LIMIT, ratio)
    ).toDecimalPlaces(4),
    openedAt: new Date(t.openedAt),
    executedAt: new Date(t.closedAt),
  };
}

export function journalData(j: JournalEntry) {
  return {
    time: new Date(j.time),
    text: j.text.slice(0, 500),
    isUserNote: j.isUserNote,
    pnl: j.pnl ?? null,
  };
}

export function balanceEventData(b: BalanceEvent) {
  return {
    time: new Date(b.time),
    balanceBefore: b.balanceBefore,
    balanceAfter: b.balanceAfter,
    pnl: b.pnl,
    action: b.action.slice(0, 300),
  };
}

// ─── Engine → wire DTO ─────────────────────────────────────────────────────────

const s = (v: Decimal) => v.toString();

export function positionDTO(p: Position): PaperPositionDTO {
  return {
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    quantity: s(p.quantity),
    entryPrice: s(p.entryPrice),
    entryUsdtAmount: s(p.entryUsdtAmount),
    openedAt: p.openedAt,
    ...(p.takeProfit ? { takeProfit: s(p.takeProfit) } : {}),
    ...(p.stopLoss ? { stopLoss: s(p.stopLoss) } : {}),
  };
}

export function pendingDTO(o: PendingOrder): PaperPendingOrderDTO {
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    usdtAmount: s(o.usdtAmount),
    triggerPrice: s(o.triggerPrice),
    qty: s(o.qty),
    leverage: o.leverage,
    placedAt: o.placedAt,
    ...(o.takeProfit ? { takeProfit: s(o.takeProfit) } : {}),
    ...(o.stopLoss ? { stopLoss: s(o.stopLoss) } : {}),
  };
}

export function orderDTO(o: HistoricalOrder): PaperOrderDTO {
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    qty: s(o.qty),
    ...(o.limitPrice ? { limitPrice: s(o.limitPrice) } : {}),
    ...(o.stopPrice ? { stopPrice: s(o.stopPrice) } : {}),
    ...(o.fillPrice ? { fillPrice: s(o.fillPrice) } : {}),
    status: o.status,
    commission: s(o.commission),
    ...(o.margin ? { margin: s(o.margin) } : {}),
    placingTime: o.placingTime,
    closingTime: o.closingTime,
    ...(o.rejectionReason ? { rejectionReason: o.rejectionReason } : {}),
  };
}

export function tradeDTO(t: ClosedTrade): PaperTradeDTO {
  return {
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    quantity: s(t.quantity),
    entryPrice: s(t.entryPrice),
    exitPrice: s(t.exitPrice),
    pnl: s(t.pnl),
    openedAt: t.openedAt,
    closedAt: t.closedAt,
  };
}

export function journalDTO(j: JournalEntry): PaperJournalEntryDTO {
  return {
    id: j.id,
    time: j.time,
    text: j.text,
    isUserNote: j.isUserNote,
    ...(j.pnl !== undefined ? { pnl: s(j.pnl) } : {}),
  };
}

export function balanceEventDTO(b: BalanceEvent): PaperBalanceEventDTO {
  return {
    id: b.id,
    time: b.time,
    balanceBefore: s(b.balanceBefore),
    balanceAfter: s(b.balanceAfter),
    pnl: s(b.pnl),
    action: b.action,
  };
}

export function deltaDTO(delta: Delta, version: number): PaperDeltaDTO {
  return {
    account: {
      balance: s(delta.account.balance),
      realizedPnl: s(delta.account.realizedPnl),
      leverage: delta.account.leverage,
      version,
    },
    positionsUpsert: delta.positionsUpsert.map(positionDTO),
    positionsRemove: delta.positionsRemove,
    pendingUpsert: delta.pendingUpsert.map(pendingDTO),
    pendingRemove: delta.pendingRemove,
    orders: delta.orders.map(orderDTO),
    trades: delta.trades.map(tradeDTO),
    balanceEvents: delta.balanceEvents.map(balanceEventDTO),
    journal: delta.journal.map(journalDTO),
    journalEdits: delta.journalEdits,
    ...(delta.reset ? { reset: true } : {}),
  };
}
