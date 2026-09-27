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
 *
 * Liquidation (BP-3): a USDT Perpetual position is liquidated when the **mark** price reaches its
 * liquidation price; TP / SL, stops and limits keep triggering on the **last** price (Bybit's
 * default). On a live tick liquidation is checked first — it closes the whole position, so a TP /
 * SL on the same tick has nothing left to close. In a candle backfill the order within one minute
 * is unknown; TP / SL is checked first there, because a stop-loss sits between the entry and the
 * liquidation price, so a continuous price path reaches it first.
 */

import type { Decimal } from '@prisma/client/runtime/client';
import { markHitsLiquidation, type RiskTier } from '../bybitSpec.js';
import { riskOf } from './margin.js';
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

/**
 * `price` is the price that triggered it — the last price, or for a liquidation the mark price.
 * `fillAt` is set only by a candle backfill.
 */
export type Trigger =
  | { kind: 'exit'; positionId: string; leg: ExitLeg; price: Decimal; fillAt?: Decimal }
  | { kind: 'fill'; orderId: string; price: Decimal; fillAt?: Decimal }
  | { kind: 'liquidation'; positionId: string; price: Decimal; fillAt?: Decimal };

/** The mark price of a USDT Perpetual tick and the symbol's risk-limit tiers (BP-3). */
export interface MarkInput {
  price: Decimal;
  tiers: RiskTier[];
}

/** True when `mark` has reached the position's liquidation price. */
export function isLiquidatable(pos: Position, mark: Decimal, tiers: RiskTier[]): boolean {
  return markHitsLiquidation(pos.side, riskOf(pos, tiers).liqPrice, mark);
}

/** Live tick: every position / pending order of `category:symbol` that `price` triggers. */
export function evaluateTick(
  category: Category,
  symbol: string,
  price: Decimal,
  positions: Position[],
  pendingOrders: PendingOrder[],
  mark?: MarkInput
): Trigger[] {
  const triggers: Trigger[] = [];
  for (const pos of positions) {
    if (pos.category !== category || pos.symbol !== symbol) continue;
    if (mark && isLiquidatable(pos, mark.price, mark.tiers)) {
      triggers.push({ kind: 'liquidation', positionId: pos.id, price: mark.price });
      continue;
    }
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
  /** Price at the candle's start — a mark-price candle's open is the mark at a funding timestamp */
  open?: Decimal;
  high: Decimal;
  low: Decimal;
}

/**
 * Backfill for one candle. The high/low sweep follows the browser (TP before SL; fill at the
 * crossed level). A candle that started before the position opened / the order was placed is
 * skipped, because its range includes prices from before that item existed (S3).
 *
 * `mark` is the same minute's mark-price candle (USDT Perpetual): with no TP / SL hit, a position
 * whose liquidation price the mark range reached is liquidated.
 */
export function evaluateCandle(
  category: Category,
  symbol: string,
  candle: Candle,
  positions: Position[],
  pendingOrders: PendingOrder[],
  mark?: { candle: Candle; tiers: RiskTier[] }
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
    } else if (mark && mark.candle.start >= pos.openedAt) {
      const { liqPrice } = riskOf(pos, mark.tiers);
      const extreme = pos.side === 'long' ? mark.candle.low : mark.candle.high;
      if (markHitsLiquidation(pos.side, liqPrice, extreme)) {
        triggers.push({
          kind: 'liquidation',
          positionId: pos.id,
          price: liqPrice,
          fillAt: liqPrice,
        });
      }
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
