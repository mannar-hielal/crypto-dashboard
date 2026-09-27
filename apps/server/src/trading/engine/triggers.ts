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
 * liquidation price, so a continuous price path reaches it first — unless the stop-loss was set
 * beyond the liquidation price, which the path can't reach first: then the liquidation wins.
 *
 * Trigger source (BP-5 B): each TP / SL leg and each stop order triggers on the price it is set to
 * — last (the default), mark or index (Bybit's `triggerBy`). A limit always rests on the last
 * price, and spot has only the last price. A leg whose source price isn't known yet (no mark /
 * index on this tick, no candle of that source for the minute) is not checked.
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
  TriggerBy,
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

/** True when `price` has reached the position's `leg` (a long's TP above, its SL below). */
export function legHit(
  pos: { side: PositionSide; takeProfit?: Decimal; stopLoss?: Decimal },
  leg: ExitLeg,
  price: Decimal
): boolean {
  const level = leg === 'take-profit' ? pos.takeProfit : pos.stopLoss;
  if (level === undefined) return false;
  const onRise = (pos.side === 'long') === (leg === 'take-profit');
  return onRise ? price.gte(level) : price.lte(level);
}

/** What a position's exit leg triggers on (absent = LastPrice). */
export function legTriggerBy(
  pos: { tpTriggerBy?: TriggerBy; slTriggerBy?: TriggerBy },
  leg: ExitLeg
): TriggerBy {
  return (leg === 'take-profit' ? pos.tpTriggerBy : pos.slTriggerBy) ?? 'LastPrice';
}

/** What a pending order triggers on: a limit and any spot order on the last price. */
export function orderTriggerBy(order: {
  category: Category;
  type: PendingType;
  triggerBy?: TriggerBy;
}): TriggerBy {
  return order.category === 'linear' && order.type === 'stop'
    ? (order.triggerBy ?? 'LastPrice')
    : 'LastPrice';
}

/** One tick's (or one minute's) prices per source; mark / index are USDT Perpetual only. */
export interface PriceSet<T> {
  last: T;
  mark?: T;
  index?: T;
}

export function priceFor<T>(prices: PriceSet<T>, by: TriggerBy): T | undefined {
  return by === 'MarkPrice' ? prices.mark : by === 'IndexPrice' ? prices.index : prices.last;
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
 * `price` is the price that triggered it — the source price of the leg / order (`by`), or for a
 * liquidation the mark price.
 * `fillAt` and `at` are set only by a candle backfill: the level it crossed, and when (the last
 * millisecond of the candle's minute — the records are stamped then, not when the backfill ran, so
 * a position it opens is still checked by the gap's later candles and funding timestamps).
 */
export type Trigger =
  | {
      kind: 'exit';
      positionId: string;
      leg: ExitLeg;
      price: Decimal;
      /** The source `price` is (absent = LastPrice) — re-checked against the leg's at execution */
      by?: TriggerBy;
      fillAt?: Decimal;
      at?: number;
    }
  | {
      kind: 'fill';
      orderId: string;
      price: Decimal;
      by?: TriggerBy;
      fillAt?: Decimal;
      at?: number;
    }
  | {
      /**
       * A cross account whose MM rate reached 100% (BP-5 E). `price` is the mark of `symbol` that
       * triggered it (a backfill: the minute's worst mark, with `fillAt` set to it).
       */
      kind: 'account-liquidation';
      symbol: string;
      price: Decimal;
      fillAt?: Decimal;
      at?: number;
    }
  | {
      kind: 'liquidation';
      positionId: string;
      price: Decimal;
      fillAt?: Decimal;
      at?: number;
      /**
       * Backfill: the candle's worst mark (its low for a long, high for a short). A partial
       * liquidation steps down every tier it reaches in that minute (BP-5 C).
       */
      worstMark?: Decimal;
    };

/** The last millisecond of a 1m candle — when a backfilled trigger in it is stamped. */
const candleEnd = (candle: Candle) => candle.start + 60_000 - 1;

/** The mark price of a USDT Perpetual tick and the symbol's risk-limit tiers (BP-3). */
export interface MarkInput {
  price: Decimal;
  tiers: RiskTier[];
  /**
   * False for a cross-margin account (BP-5 E): its positions have no isolated liquidation price —
   * the account is liquidated as a whole (cross.ts). The mark still drives Mark-price TP / SL.
   */
  liquidation?: boolean;
}

/** True when `mark` has reached the position's liquidation price. */
export function isLiquidatable(pos: Position, mark: Decimal, tiers: RiskTier[]): boolean {
  return markHitsLiquidation(pos.side, riskOf(pos, tiers).liqPrice, mark);
}

/** `by` on a trigger only when it isn't the default, so LastPrice triggers look as before. */
const byField = (by: TriggerBy) => (by === 'LastPrice' ? {} : { by });

/**
 * Live tick: every position / pending order of `category:symbol` that the tick triggers. `price`
 * is the last price; `mark` (with the symbol's tiers) and `index` are the USDT Perpetual tick's
 * mark and index prices.
 */
export function evaluateTick(
  category: Category,
  symbol: string,
  price: Decimal,
  positions: Position[],
  pendingOrders: PendingOrder[],
  mark?: MarkInput,
  index?: Decimal
): Trigger[] {
  const prices: PriceSet<Decimal> = { last: price, mark: mark?.price, index };
  const triggers: Trigger[] = [];
  for (const pos of positions) {
    if (pos.category !== category || pos.symbol !== symbol) continue;
    if (mark && mark.liquidation !== false && isLiquidatable(pos, mark.price, mark.tiers)) {
      triggers.push({ kind: 'liquidation', positionId: pos.id, price: mark.price });
      continue;
    }
    // TP is checked first, so TP wins when both are hit
    for (const leg of ['take-profit', 'stop-loss'] as const) {
      const by = legTriggerBy(pos, leg);
      const at = priceFor(prices, by);
      if (at && legHit(pos, leg, at)) {
        triggers.push({ kind: 'exit', positionId: pos.id, leg, price: at, ...byField(by) });
        break;
      }
    }
  }
  for (const order of pendingOrders) {
    if (order.category !== category || order.symbol !== symbol) continue;
    const by = orderTriggerBy(order);
    const at = priceFor(prices, by);
    if (at && checkPendingTrigger(order, at)) {
      triggers.push({ kind: 'fill', orderId: order.id, price: at, ...byField(by) });
    }
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
 * `mark` is the same minute's mark-price candle (USDT Perpetual): with no TP / SL hit — or a
 * stop-loss set beyond the liquidation price, which the path can't reach first — a position whose
 * liquidation price the mark range reached is liquidated.
 *
 * `index` is the same minute's index-price candle, for legs / stops set to trigger on the index
 * (BP-5 B); a leg set to the mark reads the mark candle.
 */
export function evaluateCandle(
  category: Category,
  symbol: string,
  candle: Candle,
  positions: Position[],
  pendingOrders: PendingOrder[],
  mark?: { candle: Candle; tiers: RiskTier[]; liquidation?: boolean },
  index?: Candle
): Trigger[] {
  const candles: PriceSet<Candle> = { last: candle, mark: mark?.candle, index };
  const triggers: Trigger[] = [];
  for (const pos of positions) {
    if (pos.category !== category || pos.symbol !== symbol || candle.start < pos.openedAt) {
      continue;
    }
    // TP before SL, each on the candle of its own source; the extreme in the leg's direction
    let leg: ExitLeg | null = null;
    let legBy: TriggerBy = 'LastPrice';
    for (const l of ['take-profit', 'stop-loss'] as const) {
      const by = legTriggerBy(pos, l);
      const c = priceFor(candles, by);
      if (!c) continue;
      const onRise = (pos.side === 'long') === (l === 'take-profit');
      if (legHit(pos, l, onRise ? c.high : c.low)) {
        leg = l;
        legBy = by;
        break;
      }
    }
    let liquidation: Trigger | null = null;
    if (mark && mark.liquidation !== false && mark.candle.start >= pos.openedAt) {
      const { liqPrice } = riskOf(pos, mark.tiers);
      const extreme = pos.side === 'long' ? mark.candle.low : mark.candle.high;
      if (markHitsLiquidation(pos.side, liqPrice, extreme)) {
        liquidation = {
          kind: 'liquidation',
          positionId: pos.id,
          price: liqPrice,
          fillAt: liqPrice,
          at: candleEnd(mark.candle),
          worstMark: extreme,
        };
      }
    }
    // A stop-loss normally sits between the entry and the liquidation price, so it is reached
    // first. One set beyond the liquidation price (Bybit accepts it) never fills: the price path
    // reaches the liquidation price first
    const stopBeyondLiq =
      leg === 'stop-loss' &&
      liquidation !== null &&
      pos.stopLoss !== undefined &&
      (pos.side === 'long'
        ? pos.stopLoss.lte(liquidation.price)
        : pos.stopLoss.gte(liquidation.price));
    if (leg && !stopBeyondLiq) {
      const level = (leg === 'take-profit' ? pos.takeProfit : pos.stopLoss) as Decimal;
      triggers.push({
        kind: 'exit',
        positionId: pos.id,
        leg,
        price: level,
        ...byField(legBy),
        fillAt: level,
        at: candleEnd(candle),
      });
    } else if (liquidation) {
      triggers.push(liquidation);
    }
  }
  for (const order of pendingOrders) {
    if (order.category !== category || order.symbol !== symbol || candle.start < order.placedAt) {
      continue;
    }
    const by = orderTriggerBy(order);
    const c = priceFor(candles, by);
    if (!c) continue;
    const extreme = triggersOnDrop(order) ? c.low : c.high;
    if (checkPendingTrigger(order, extreme)) {
      triggers.push({
        kind: 'fill',
        orderId: order.id,
        price: order.triggerPrice,
        ...byField(by),
        fillAt: order.triggerPrice,
        at: candleEnd(candle),
      });
    }
  }
  return triggers;
}
