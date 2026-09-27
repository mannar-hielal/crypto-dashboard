/**
 * Mapping between database rows, engine types and the SDK wire DTOs (BYBIT_PARITY_PLAN BP-1).
 *
 * Rows written by the pre-BP-1 browser engine carry the browser's id in `refId`. The engine
 * addresses them by that id, so `refId ?? id` is the public id everywhere.
 *
 * BP-2: fees are stored where they were charged (Position.entryFee, Order.reserved, the fill's
 * feeRate). The migration backfilled pre-BP-2 rows with the 0.07% they paid; a row an old server
 * writes during a rolling deploy has none, so it is read at that same legacy rate.
 *
 * BP-3: a position's liquidation / bankruptcy price, IM and MM are derived from it and the symbol's
 * risk-limit tiers when it is sent (bybitSpec.positionRisk) — never stored, so a tier change or
 * a re-margin can't leave a stale liquidation price behind.
 */

import { Decimal } from '@prisma/client/runtime/client';
import type {
  PaperBalanceEventDTO,
  PaperDeltaDTO,
  PaperJournalEntryDTO,
  PaperOrderDTO,
  PaperPendingOrderDTO,
  PaperPositionDTO,
  PaperSpotBalanceDTO,
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
  PendingType,
  Position,
  SpotHolding,
  Category,
} from './engine/index.js';
import { fallbackRiskTiers, LEGACY_FEE_RATE, type RiskTier } from './bybitSpec.js';
import { riskOf } from './engine/margin.js';

/** Risk-limit tiers of a USDT Perpetual symbol. */
export type RiskTiersFor = (symbol: string) => RiskTier[];

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
  leverage: number;
  entryFee: Dec;
  closeFeeReserve: Dec;
  extraMargin: Dec;
  takeProfit: Dec | null;
  stopLoss: Dec | null;
  openedAt: Date;
}

export interface OrderRow {
  id: string;
  refId: string | null;
  category: string;
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
  reserved: Dec;
  feeRate: Dec | null;
  feeAsset: string | null;
  isMaker: boolean | null;
  ocoGroup: string | null;
  createType: string | null;
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
  category: string;
  symbol: string;
  side: string;
  quantity: Dec;
  executedPrice: Dec;
  entryPrice: Dec | null;
  pnl: Dec;
  grossPnl: Dec | null;
  execType: string;
  openedAt: Date | null;
  executedAt: Date;
}

export interface SpotBalanceRow {
  coin: string;
  free: Dec;
  locked: Dec;
  avgCost: Dec;
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
const LEGACY = new Decimal(LEGACY_FEE_RATE);
const categoryOf = (v: string): Category => (v === 'spot' ? 'spot' : 'linear');

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
  const margin = d(r.margin);
  const entryFee = d(r.entryFee);
  return {
    id: r.refId ?? r.id,
    category: 'linear',
    symbol: r.symbol,
    side: r.side === 'SHORT' ? 'short' : 'long',
    quantity: d(r.quantity),
    entryPrice: d(r.entryPrice),
    entryUsdtAmount: margin,
    leverage: r.leverage,
    // Every BP-2 open charges a fee, so 0 means an old-server row: it paid the legacy 0.07%
    entryFee: entryFee.gt(0) ? entryFee : margin.times(LEGACY),
    closeFeeReserve: d(r.closeFeeReserve),
    ...(d(r.extraMargin).gt(0) ? { extraMargin: d(r.extraMargin) } : {}),
    openedAt: r.openedAt.getTime(),
    ...(tp ? { takeProfit: tp } : {}),
    ...(sl ? { stopLoss: sl } : {}),
  };
}

const PENDING_TYPE_FROM_DB: Record<string, PendingType> = {
  LIMIT: 'limit',
  STOP: 'stop',
  TAKE_PROFIT: 'take-profit',
  STOP_LOSS: 'stop-loss',
};

export function pendingFromRow(r: OrderRow): PendingOrder {
  const tp = optD(r.takeProfit);
  const sl = optD(r.stopLoss);
  const type = PENDING_TYPE_FROM_DB[r.orderType] ?? 'limit';
  // A limit rests at limitPrice; stops and spot TP / SL legs trigger at stopPrice
  const trigger = type === 'limit' ? r.limitPrice : r.stopPrice;
  const margin = d(r.margin);
  const reserved = d(r.reserved);
  return {
    id: r.refId ?? r.id,
    category: categoryOf(r.category),
    symbol: r.symbol,
    side: r.side === 'SELL' ? 'sell' : 'buy',
    type,
    usdtAmount: margin,
    // 0 = placed by an old server during a rolling deploy: it took margin + 0.07%
    reserved: reserved.gt(0) ? reserved : margin.plus(margin.times(LEGACY)),
    triggerPrice: d(trigger ?? r.limitPrice ?? r.stopPrice ?? '0'),
    qty: d(r.quantity),
    leverage: r.leverage,
    placedAt: r.createdAt.getTime(),
    ...(r.ocoGroup ? { ocoGroup: r.ocoGroup } : {}),
    ...(tp ? { takeProfit: tp } : {}),
    ...(sl ? { stopLoss: sl } : {}),
  };
}

export function spotFromRow(r: SpotBalanceRow): SpotHolding {
  return { coin: r.coin, free: d(r.free), locked: d(r.locked), avgCost: d(r.avgCost) };
}

export function historyOrderFromRow(r: OrderRow): PaperOrderDTO {
  const margin = d(r.margin);
  const closing = r.filledAt ?? r.cancelledAt ?? r.updatedAt;
  return {
    id: r.refId ?? r.id,
    category: categoryOf(r.category),
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
    ...(r.feeRate !== null ? { feeRate: d(r.feeRate).toString() } : {}),
    ...(r.feeAsset !== null ? { feeAsset: r.feeAsset } : {}),
    ...(r.isMaker !== null ? { isMaker: r.isMaker } : {}),
    ...(margin.gt(0) ? { margin: margin.toString(), leverage: r.leverage } : {}),
    placingTime: r.createdAt.getTime(),
    closingTime: closing.getTime(),
    ...(r.rejectionReason ? { rejectionReason: r.rejectionReason } : {}),
    ...(r.createType === 'CreateByLiq' ? { createType: 'CreateByLiq' as const } : {}),
  };
}

export function tradeFromRow(r: TradeRow): PaperTradeDTO {
  return {
    id: r.refId ?? r.id,
    category: categoryOf(r.category),
    symbol: r.symbol,
    // The trade row stores the closing side: SELL closed a long, BUY closed a short
    side: r.side === 'BUY' ? 'short' : 'long',
    quantity: d(r.quantity).toString(),
    entryPrice: (r.entryPrice ? d(r.entryPrice) : new Decimal(0)).toString(),
    exitPrice: d(r.executedPrice).toString(),
    pnl: d(r.grossPnl ?? r.pnl).toString(),
    openedAt: r.openedAt?.getTime() ?? 0,
    closedAt: r.executedAt.getTime(),
    ...(r.execType === 'BustTrade' ? { execType: 'BustTrade' as const } : {}),
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
    category: p.category,
    leverage: p.leverage,
    entryFee: p.entryFee,
    closeFeeReserve: p.closeFeeReserve,
    extraMargin: p.extraMargin ?? new Decimal(0),
    takeProfit: p.takeProfit ?? null,
    stopLoss: p.stopLoss ?? null,
    openedAt: new Date(p.openedAt),
  };
}

export function pendingData(o: PendingOrder) {
  return {
    category: o.category,
    symbol: o.symbol,
    side: orderSideToDb(o.side),
    orderType: ORDER_TYPE_TO_DB[o.type],
    quantity: o.qty,
    limitPrice: o.type === 'limit' ? o.triggerPrice : null,
    stopPrice: o.type === 'limit' ? null : o.triggerPrice,
    ocoGroup: o.ocoGroup ?? null,
    takeProfit: o.takeProfit ?? null,
    stopLoss: o.stopLoss ?? null,
    margin: o.usdtAmount,
    reserved: o.reserved,
    leverage: o.leverage,
    status: 'PENDING',
    createdAt: new Date(o.placedAt),
  };
}

export function spotData(h: SpotHolding) {
  return { coin: h.coin, free: h.free, locked: h.locked, avgCost: h.avgCost };
}

export function historyOrderData(o: HistoricalOrder) {
  const closedAt = new Date(o.closingTime);
  return {
    category: o.category,
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
    feeRate: o.feeRate ?? null,
    feeAsset: o.feeAsset ?? null,
    isMaker: o.isMaker ?? null,
    leverage: o.leverage ?? 1,
    status: o.status.toUpperCase(),
    rejectionReason: o.rejectionReason ?? null,
    createType: o.createType ?? null,
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
    category: t.category,
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
    execType: t.execType ?? 'Trade',
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

export function positionDTO(p: Position, tiers: RiskTier[]): PaperPositionDTO {
  const risk = riskOf(p, tiers);
  return {
    id: p.id,
    category: p.category,
    symbol: p.symbol,
    side: p.side,
    quantity: s(p.quantity),
    entryPrice: s(p.entryPrice),
    entryUsdtAmount: s(p.entryUsdtAmount),
    leverage: p.leverage,
    marginMode: 'isolated',
    entryFee: s(p.entryFee),
    closeFeeReserve: s(p.closeFeeReserve),
    extraMargin: s(p.extraMargin ?? new Decimal(0)),
    liqPrice: s(risk.liqPrice.toDecimalPlaces(8)),
    bustPrice: s(risk.bustPrice.toDecimalPlaces(8)),
    positionIM: s(risk.positionIM.toDecimalPlaces(8)),
    positionMM: s(risk.positionMM.toDecimalPlaces(8)),
    mmr: s(risk.mmr),
    openedAt: p.openedAt,
    ...(p.takeProfit ? { takeProfit: s(p.takeProfit) } : {}),
    ...(p.stopLoss ? { stopLoss: s(p.stopLoss) } : {}),
  };
}

export function pendingDTO(o: PendingOrder): PaperPendingOrderDTO {
  return {
    id: o.id,
    category: o.category,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    usdtAmount: s(o.usdtAmount),
    reserved: s(o.reserved),
    triggerPrice: s(o.triggerPrice),
    qty: s(o.qty),
    leverage: o.leverage,
    placedAt: o.placedAt,
    ...(o.ocoGroup ? { ocoGroup: o.ocoGroup } : {}),
    ...(o.takeProfit ? { takeProfit: s(o.takeProfit) } : {}),
    ...(o.stopLoss ? { stopLoss: s(o.stopLoss) } : {}),
  };
}

export function spotDTO(h: SpotHolding): PaperSpotBalanceDTO {
  return { coin: h.coin, free: s(h.free), locked: s(h.locked), avgCost: s(h.avgCost) };
}

export function orderDTO(o: HistoricalOrder): PaperOrderDTO {
  return {
    id: o.id,
    category: o.category,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    qty: s(o.qty),
    ...(o.limitPrice ? { limitPrice: s(o.limitPrice) } : {}),
    ...(o.stopPrice ? { stopPrice: s(o.stopPrice) } : {}),
    ...(o.fillPrice ? { fillPrice: s(o.fillPrice) } : {}),
    status: o.status,
    commission: s(o.commission),
    ...(o.feeRate ? { feeRate: s(o.feeRate) } : {}),
    ...(o.feeAsset ? { feeAsset: o.feeAsset } : {}),
    ...(o.isMaker !== undefined ? { isMaker: o.isMaker } : {}),
    ...(o.margin ? { margin: s(o.margin) } : {}),
    ...(o.margin && o.leverage ? { leverage: o.leverage } : {}),
    placingTime: o.placingTime,
    closingTime: o.closingTime,
    ...(o.rejectionReason ? { rejectionReason: o.rejectionReason } : {}),
    ...(o.createType ? { createType: o.createType } : {}),
  };
}

export function tradeDTO(t: ClosedTrade): PaperTradeDTO {
  return {
    id: t.id,
    category: t.category,
    symbol: t.symbol,
    side: t.side,
    quantity: s(t.quantity),
    entryPrice: s(t.entryPrice),
    exitPrice: s(t.exitPrice),
    pnl: s(t.pnl),
    openedAt: t.openedAt,
    closedAt: t.closedAt,
    ...(t.execType === 'BustTrade' ? { execType: 'BustTrade' as const } : {}),
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

export function deltaDTO(
  delta: Delta,
  version: number,
  riskTiers: RiskTiersFor = fallbackRiskTiers
): PaperDeltaDTO {
  return {
    account: {
      balance: s(delta.account.balance),
      realizedPnl: s(delta.account.realizedPnl),
      leverage: delta.account.leverage,
      symbolLeverage: delta.account.symbolLeverage,
      version,
    },
    positionsUpsert: delta.positionsUpsert.map((p) => positionDTO(p, riskTiers(p.symbol))),
    positionsRemove: delta.positionsRemove,
    spotUpsert: delta.spotUpsert.map(spotDTO),
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
