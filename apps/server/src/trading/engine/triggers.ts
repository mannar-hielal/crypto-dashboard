/**
 * Trigger evaluation — pure port of the browser monitors (hooks/useTPSLMonitor.ts,
 * hooks/usePendingOrderMonitor.ts).
 *
 * Live: the server sees every tick, so triggers are checked on the tick price alone and fill at
 * that price (BP-1 S3). The browser also swept the forming candle's high/low, which could fire an
 * order on a price printed before the order existed.
 *
 * Backfill: after a gap (restart, Bybit outage), 1m candles are swept in time order using their
 * high/low, like the browser's candle sweep. The fill is at the crossed level, and a candle that
 * started before an order was placed is ignored.
 */

import type { Decimal } from '@prisma/client/runtime/client';
import type {
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
  if (order.type === 'limit') {
    // Limit buy fills at/below its price, limit sell at/above.
    return order.side === 'buy' ? price.lte(order.triggerPrice) : price.gte(order.triggerPrice);
  }
  // Stop buy triggers at/above, stop sell at/below.
  return order.side === 'buy' ? price.gte(order.triggerPrice) : price.lte(order.triggerPrice);
}

/** True for orders that trigger on a price drop (limit buy, stop sell). */
function triggersOnDrop(order: { side: OrderSide; type: PendingType }): boolean {
  return (
    (order.side === 'buy' && order.type === 'limit') ||
    (order.side === 'sell' && order.type === 'stop')
  );
}

// ─── Triggers ──────────────────────────────────────────────────────────────────

export type Trigger =
  | { kind: 'exit'; positionId: string; leg: ExitLeg; price: Decimal }
  | { kind: 'fill'; orderId: string; price: Decimal };

/** Live tick: every position / pending order of `symbol` that `price` triggers. */
export function evaluateTick(
  symbol: string,
  price: Decimal,
  positions: Position[],
  pendingOrders: PendingOrder[]
): Trigger[] {
  const triggers: Trigger[] = [];
  for (const pos of positions) {
    if (pos.symbol !== symbol) continue;
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
    if (order.symbol !== symbol) continue;
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
  symbol: string,
  candle: Candle,
  positions: Position[],
  pendingOrders: PendingOrder[]
): Trigger[] {
  const triggers: Trigger[] = [];
  for (const pos of positions) {
    if (pos.symbol !== symbol || candle.start < pos.openedAt) continue;
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
      triggers.push({ kind: 'exit', positionId: pos.id, leg, price: level });
    }
  }
  for (const order of pendingOrders) {
    if (order.symbol !== symbol || candle.start < order.placedAt) continue;
    const extreme = triggersOnDrop(order) ? candle.low : candle.high;
    if (checkPendingTrigger(order, extreme)) {
      triggers.push({ kind: 'fill', orderId: order.id, price: order.triggerPrice });
    }
  }
  return triggers;
}
