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
  PaperFundingDTO,
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
  FundingExecution,
  HistoricalOrder,
  JournalEntry,
  OrderType,
  PendingOrder,
  PendingType,
  Position,
  SpotHolding,
  Category,
  TriggerBy,
  MarginMode,
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
  cumFunding: Dec;
  takeProfit: Dec | null;
  stopLoss: Dec | null;
  tpTriggerBy: string;
  slTriggerBy: string;
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
  triggerBy: string;
  tpTriggerBy: string;
  slTriggerBy: string;
  reduceOnly: boolean;
  closeOnTrigger: boolean;
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
  commission: Dec;
  feeRate: Dec | null;
  funding: Dec;
  openFee: Dec;
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

/**
 * A stored trigger source → the engine's (BP-5 B). LastPrice — the default — and anything unknown
 * are left out, so the field is present only when it changes behaviour.
 */
const triggerByField = <K extends string>(key: K, v: string): { [P in K]?: TriggerBy } =>
  v === 'MarkPrice' || v === 'IndexPrice' ? ({ [key]: v } as { [P in K]?: TriggerBy }) : {};

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
    ...(d(r.cumFunding).eq(0) ? {} : { cumFunding: d(r.cumFunding) }),
    openedAt: r.openedAt.getTime(),
    ...(tp ? { takeProfit: tp } : {}),
    ...(sl ? { stopLoss: sl } : {}),
    ...triggerByField('tpTriggerBy', r.tpTriggerBy),
    ...triggerByField('slTriggerBy', r.slTriggerBy),
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
    ...triggerByField('triggerBy', r.triggerBy),
    ...triggerByField('tpTriggerBy', r.tpTriggerBy),
    ...triggerByField('slTriggerBy', r.slTriggerBy),
    ...(r.reduceOnly ? { reduceOnly: true } : {}),
    ...(r.closeOnTrigger ? { closeOnTrigger: true } : {}),
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
    ...(r.reduceOnly ? { reduceOnly: true } : {}),
    ...(r.closeOnTrigger ? { closeOnTrigger: true } : {}),
    ...triggerByField('triggerBy', r.triggerBy),
  };
}

/**
 * Bybit's Closed P&L fields for a close (BP-5 D): closedPnl = gross − open fee − close fee −
 * funding, plus the v5 names (avgEntryPrice / avgExitPrice / closedSize) for the parity test.
 */
function closedPnlFields(
  gross: Decimal,
  openFee: Decimal,
  closeFee: Decimal,
  funding: Decimal,
  t: { entryPrice: string; exitPrice: string; quantity: string }
) {
  return {
    openFee: openFee.toString(),
    closeFee: closeFee.toString(),
    closedPnl: gross.minus(openFee).minus(closeFee).minus(funding).toString(),
    avgEntryPrice: t.entryPrice,
    avgExitPrice: t.exitPrice,
    closedSize: t.quantity,
  };
}

export function tradeFromRow(r: TradeRow): PaperTradeDTO {
  const entryPrice = (r.entryPrice ? d(r.entryPrice) : new Decimal(0)).toString();
  const exitPrice = d(r.executedPrice).toString();
  const quantity = d(r.quantity).toString();
  const gross = d(r.grossPnl ?? r.pnl);
  return {
    id: r.refId ?? r.id,
    category: categoryOf(r.category),
    symbol: r.symbol,
    // The trade row stores the closing side: SELL closed a long, BUY closed a short
    side: r.side === 'BUY' ? 'short' : 'long',
    quantity: d(r.quantity).toString(),
    entryPrice: (r.entryPrice ? d(r.entryPrice) : new Decimal(0)).toString(),
    exitPrice: d(r.executedPrice).toString(),
    pnl: gross.toString(),
    openedAt: r.openedAt?.getTime() ?? 0,
    closedAt: r.executedAt.getTime(),
    ...(r.execType === 'BustTrade' ? { execType: 'BustTrade' as const } : {}),
    ...(d(r.funding).eq(0) ? {} : { funding: d(r.funding).toString() }),
    ...closedPnlFields(gross, d(r.openFee), d(r.commission), d(r.funding), {
      entryPrice,
      exitPrice,
      quantity,
    }),
  };
}

/** A `Funding` Trade row → the wire execution (BP-4). */
export function fundingFromRow(r: TradeRow): PaperFundingDTO {
  return {
    id: r.refId ?? r.id,
    symbol: r.symbol,
    side: r.side === 'BUY' ? 'short' : 'long',
    qty: d(r.quantity).toString(),
    markPrice: d(r.executedPrice).toString(),
    rate: (r.feeRate ? d(r.feeRate) : new Decimal(0)).toString(),
    fee: d(r.commission).toString(),
    time: r.executedAt.getTime(),
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
    cumFunding: p.cumFunding ?? new Decimal(0),
    takeProfit: p.takeProfit ?? null,
    stopLoss: p.stopLoss ?? null,
    tpTriggerBy: p.tpTriggerBy ?? 'LastPrice',
    slTriggerBy: p.slTriggerBy ?? 'LastPrice',
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
    triggerBy: o.triggerBy ?? 'LastPrice',
    tpTriggerBy: o.tpTriggerBy ?? 'LastPrice',
    slTriggerBy: o.slTriggerBy ?? 'LastPrice',
    reduceOnly: o.reduceOnly ?? false,
    closeOnTrigger: o.closeOnTrigger ?? false,
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
    triggerBy: o.triggerBy ?? 'LastPrice',
    reduceOnly: o.reduceOnly ?? false,
    closeOnTrigger: o.closeOnTrigger ?? false,
    createdAt: new Date(o.placingTime),
    filledAt: o.status === 'filled' ? closedAt : null,
    cancelledAt: o.status === 'filled' ? null : closedAt,
  };
}

/** pnlPercent column is Decimal(12,4): a ratio, clamped so an extreme trade can't overflow it. */
const PNL_PERCENT_LIMIT = new Decimal('99999999');

export function tradeData(t: ClosedTrade) {
  // Closed P&L as Bybit shows it: net of the close fee and of the closed part's funding
  const funding = t.funding ?? new Decimal(0);
  const net = t.pnl.minus(t.exitCommission).minus(funding);
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
    funding,
    openFee: t.openFee ?? new Decimal(0),
  };
}

/**
 * A funding settlement as a Trade row (Bybit execution `execType = Funding`, BP-4). The side is
 * stored like a close (SELL = long), price = mark, commission = the fee (+ = paid), pnl = −fee.
 */
export function fundingData(f: FundingExecution) {
  return {
    category: 'linear',
    symbol: f.symbol,
    side: f.side === 'long' ? 'SELL' : 'BUY',
    quantity: f.qty,
    executedPrice: f.markPrice,
    totalCost: f.qty.times(f.markPrice),
    commission: f.fee,
    pnl: f.fee.neg(),
    grossPnl: new Decimal(0),
    pnlPercent: new Decimal(0),
    execType: 'Funding',
    feeRate: f.rate,
    executedAt: new Date(f.time),
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

/**
 * A position on the wire. In cross margin (BP-5 E) its liquidation / bankruptcy prices depend on
 * the whole account and the live marks, so they are left out (unknown) — the client estimates them
 * live from the account figures, as Bybit shows an estimate.
 */
export function positionDTO(
  p: Position,
  tiers: RiskTier[],
  mode: MarginMode = 'ISOLATED_MARGIN'
): PaperPositionDTO {
  const risk = riskOf(p, tiers);
  const cross = mode === 'REGULAR_MARGIN';
  return {
    id: p.id,
    category: p.category,
    symbol: p.symbol,
    side: p.side,
    quantity: s(p.quantity),
    entryPrice: s(p.entryPrice),
    entryUsdtAmount: s(p.entryUsdtAmount),
    leverage: p.leverage,
    marginMode: cross ? 'cross' : 'isolated',
    entryFee: s(p.entryFee),
    closeFeeReserve: s(p.closeFeeReserve),
    extraMargin: s(p.extraMargin ?? new Decimal(0)),
    cumFunding: s(p.cumFunding ?? new Decimal(0)),
    ...(cross
      ? {}
      : {
          liqPrice: s(risk.liqPrice.toDecimalPlaces(8)),
          bustPrice: s(risk.bustPrice.toDecimalPlaces(8)),
        }),
    positionIM: s(risk.positionIM.toDecimalPlaces(8)),
    positionMM: s(risk.positionMM.toDecimalPlaces(8)),
    mmr: s(risk.mmr),
    openedAt: p.openedAt,
    ...(p.takeProfit ? { takeProfit: s(p.takeProfit) } : {}),
    ...(p.stopLoss ? { stopLoss: s(p.stopLoss) } : {}),
    ...(p.tpTriggerBy ? { tpTriggerBy: p.tpTriggerBy } : {}),
    ...(p.slTriggerBy ? { slTriggerBy: p.slTriggerBy } : {}),
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
    ...(o.triggerBy ? { triggerBy: o.triggerBy } : {}),
    ...(o.tpTriggerBy ? { tpTriggerBy: o.tpTriggerBy } : {}),
    ...(o.slTriggerBy ? { slTriggerBy: o.slTriggerBy } : {}),
    ...(o.reduceOnly ? { reduceOnly: true } : {}),
    ...(o.closeOnTrigger ? { closeOnTrigger: true } : {}),
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
    ...(o.reduceOnly ? { reduceOnly: true } : {}),
    ...(o.closeOnTrigger ? { closeOnTrigger: true } : {}),
    ...(o.triggerBy ? { triggerBy: o.triggerBy } : {}),
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
    ...(t.funding && !t.funding.eq(0) ? { funding: s(t.funding) } : {}),
    ...closedPnlFields(
      t.pnl,
      t.openFee ?? new Decimal(0),
      t.exitCommission,
      t.funding ?? new Decimal(0),
      { entryPrice: s(t.entryPrice), exitPrice: s(t.exitPrice), quantity: s(t.quantity) }
    ),
  };
}

export function fundingDTO(f: FundingExecution): PaperFundingDTO {
  return {
    id: f.id,
    symbol: f.symbol,
    side: f.side,
    qty: s(f.qty),
    markPrice: s(f.markPrice),
    rate: s(f.rate),
    fee: s(f.fee),
    time: f.time,
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
      marginMode: delta.account.marginMode,
      version,
    },
    positionsUpsert: delta.positionsUpsert.map((p) =>
      positionDTO(p, riskTiers(p.symbol), delta.account.marginMode)
    ),
    positionsRemove: delta.positionsRemove,
    spotUpsert: delta.spotUpsert.map(spotDTO),
    pendingUpsert: delta.pendingUpsert.map(pendingDTO),
    pendingRemove: delta.pendingRemove,
    orders: delta.orders.map(orderDTO),
    trades: delta.trades.map(tradeDTO),
    ...(delta.fundings.length ? { fundings: delta.fundings.map(fundingDTO) } : {}),
    balanceEvents: delta.balanceEvents.map(balanceEventDTO),
    journal: delta.journal.map(journalDTO),
    journalEdits: delta.journalEdits,
    ...(delta.reset ? { reset: true } : {}),
  };
}
