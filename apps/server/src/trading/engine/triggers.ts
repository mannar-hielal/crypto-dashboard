/**
 * Trigger evaluation — pure port of the browser monitors (hooks/useTPSLMonitor.ts,
 * hooks/usePendingOrderMonitor.ts).
 *
 * Live: the server sees every tick, so triggers are checked on the tick's last price alone (BP-1
 * S3). Where they fill is decided by executeTrigger (BP-2): a resting limit at its own price, a
 * stop / TP / SL at the live ask / bid.
 *
 * Backfill: after a gap (restart, Bybit outage), 1m candles are swept in time order using their
 * high/low, like the browser's candle sweep. There is no quote for the past, so the fill is at the
 * crossed level (`fillAt`), and a candle that started before an order was placed is ignored.
 *
 * Every check is per market: a USDT Perpetual position never triggers on a spot price.
 */

import type { Decimal } from '@prisma/client/runtime/client';
import type {
  Category,
  ExitLeg,
  OrderSide,
  PendingOrder,
  PendingType,
  Position,
  PositionSide,
} from './types.js';

// ─── Pure checks (ported unchanged) ────────────────────────────────────────────

/** useTPSLMonitor.checkTPSL — TP is checked first, so TP wins when both are hit. */
export function checkTPSL(
  pos: { side: PositionSide; takeProfit?: Decimal; stopLoss?: Decimal },
  price: Decimal
): 'TP' | 'SL' | null {
  if (pos.side === 'long') {
    if (pos.takeProfit !== undefined && price.gte(pos.takeProfit)) return 'TP';
    if (pos.stopLoss !== undefined && price.lte(pos.stopLoss)) return 'SL';
  } else {
    if (pos.takeProfit !== undefined && price.lte(pos.takeProfit)) return 'TP';
    if (pos.stopLoss !== undefined && price.gte(pos.stopLoss)) return 'SL';
  }
  return null;
}

/** usePendingOrderMonitor.checkPendingTrigger */
export function checkPendingTrigger(
  order: { side: OrderSide; type: PendingType; triggerPrice: Decimal },
  price: Decimal
): boolean {
  return triggersOnDrop(order) ? price.lte(order.triggerPrice) : price.gte(order.triggerPrice);
}

/**
 * True for orders that trigger on a price drop: limit buy, stop sell, and a spot stop-loss (a
 * sell); a limit sell, stop buy and a spot take-profit (a sell) trigger on a rise.
 */
function triggersOnDrop(order: { side: OrderSide; type: PendingType }): boolean {
  const buy = order.side === 'buy';
  switch (order.type) {
    case 'limit':
    case 'take-profit':
      return buy;
    case 'stop':
    case 'stop-loss':
      return !buy;
  }
}

// ─── Triggers ──────────────────────────────────────────────────────────────────

/** `price` is the last price that triggered it; `fillAt` is set only by a candle backfill. */
export type Trigger =
  | { kind: 'exit'; positionId: string; leg: ExitLeg; price: Decimal; fillAt?: Decimal }
  | { kind: 'fill'; orderId: string; price: Decimal; fillAt?: Decimal };

/** Live tick: every position / pending order of `category:symbol` that `price` triggers. */
export function evaluateTick(
  category: Category,
  symbol: string,
  price: Decimal,
  positions: Position[],
  pendingOrders: PendingOrder[]
): Trigger[] {
  const triggers: Trigger[] = [];
  for (const pos of positions) {
    if (pos.category !== category || pos.symbol !== symbol) continue;
    const hit = checkTPSL(pos, price);
    if (hit) {
      triggers.push({
        kind: 'exit',
        positionId: pos.id,
        leg: hit === 'TP' ? 'take-profit' : 'stop-loss',
        price,
      });
    }
  }
  for (const order of pendingOrders) {
    if (order.category !== category || order.symbol !== symbol) continue;
    if (checkPendingTrigger(order, price))
      triggers.push({ kind: 'fill', orderId: order.id, price });
  }
  return triggers;
}

export interface Candle {
  /** Candle start, Unix ms */
  start: number;
  high: Decimal;
  low: Decimal;
}

/**
 * Backfill for one candle. The high/low sweep follows the browser (TP before SL; fill at the
 * crossed level). A candle that started before the position opened / the order was placed is
 * skipped, because its range includes prices from before that item existed (S3).
 */
export function evaluateCandle(
  category: Category,
  symbol: string,
  candle: Candle,
  positions: Position[],
  pendingOrders: PendingOrder[]
): Trigger[] {
  const triggers: Trigger[] = [];
  for (const pos of positions) {
    if (pos.category !== category || pos.symbol !== symbol || candle.start < pos.openedAt) {
      continue;
    }
    const high = candle.high;
    const low = candle.low;
    let leg: ExitLeg | null = null;
    if (pos.side === 'long') {
      if (pos.takeProfit !== undefined && high.gte(pos.takeProfit)) leg = 'take-profit';
      else if (pos.stopLoss !== undefined && low.lte(pos.stopLoss)) leg = 'stop-loss';
    } else {
      if (pos.takeProfit !== undefined && low.lte(pos.takeProfit)) leg = 'take-profit';
      else if (pos.stopLoss !== undefined && high.gte(pos.stopLoss)) leg = 'stop-loss';
    }
    if (leg) {
      const level = (leg === 'take-profit' ? pos.takeProfit : pos.stopLoss) as Decimal;
      triggers.push({ kind: 'exit', positionId: pos.id, leg, price: level, fillAt: level });
    }
  }
  for (const order of pendingOrders) {
    if (order.category !== category || order.symbol !== symbol || candle.start < order.placedAt) {
      continue;
    }
    const extreme = triggersOnDrop(order) ? candle.low : candle.high;
    if (checkPendingTrigger(order, extreme)) {
      triggers.push({
        kind: 'fill',
        orderId: order.id,
        price: order.triggerPrice,
        fillAt: order.triggerPrice,
      });
    }
  }
  return triggers;
}
