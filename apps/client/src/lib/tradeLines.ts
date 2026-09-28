/**
 * Chart lines for the account's positions and orders on one pane (APP_LOG Bybit Parity BP-3) — pure,
 * no React, no chart. hooks/useTradeLines.ts draws them as lightweight-charts price lines.
 *
 * Bybit draws, on the chart of the symbol being traded:
 * - USDT Perpetual: the position's entry (side, qty and live PnL), its TP, SL and liquidation
 *   price, the active orders (limit / conditional) with their TP / SL, and the mark price.
 * - Spot: the active orders and the TP / SL of coins held.
 * TP / SL and order prices can be dragged to amend them (then confirmed); entry, liquidation and
 * mark can't. A spot TP / SL leg is placed or cancelled, never edited (plan §8), so it can't either.
 */

import type { MarketCategory } from '@crypto-dashboard/sdk';
import type { PendingOrder, Position } from '@/store/paperStore';
import { color } from '@/lib/tokens';
import { positionPnl } from '@/lib/positionMath';

export type TradeLineStyle = 'solid' | 'dashed' | 'dotted';

/** What dragging a line amends. */
export type DragTarget =
  | { kind: 'positionTp' | 'positionSl'; positionId: string }
  | { kind: 'orderPrice' | 'orderTp' | 'orderSl'; orderId: string };

export interface TradeLineSpec {
  /** Stable key, e.g. `pos:<id>:tp` — lines are updated in place, not re-created */
  id: string;
  price: number;
  color: string;
  style: TradeLineStyle;
  /** Label on the line (and its axis tag) */
  title: string;
  drag?: DragTarget;
}

export interface TradeLinesInput {
  category: MarketCategory;
  symbol: string;
  positions: Position[];
  pendingOrders: PendingOrder[];
  /** USDT Perpetual mark price (live PnL on the entry line, the mark line); null if unknown */
  mark: number | null;
  showMark: boolean;
}

const fmtQty = (q: number) => Number(q.toFixed(6)).toString();
const fmtUsd = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`;

const ORDER_LABEL: Record<PendingOrder['type'], string> = {
  limit: 'Limit',
  stop: 'Stop',
  'take-profit': 'TP',
  'stop-loss': 'SL',
};

export function buildTradeLines(input: TradeLinesInput): TradeLineSpec[] {
  const { category, symbol } = input;
  const lines: TradeLineSpec[] = [];

  if (category === 'linear') {
    for (const pos of input.positions) {
      if (pos.symbol !== symbol) continue;
      const long = pos.side === 'long';
      const pnl = input.mark !== null ? positionPnl(pos, input.mark) : null;
      lines.push({
        id: `pos:${pos.id}:entry`,
        price: pos.entryPrice,
        color: long ? color.green : color.red,
        style: 'solid',
        title: `${long ? 'Long' : 'Short'} ${fmtQty(pos.quantity)}${pnl !== null ? `  ${fmtUsd(pnl)}` : ''}`,
      });
      if (pos.takeProfit) {
        lines.push({
          id: `pos:${pos.id}:tp`,
          price: pos.takeProfit,
          color: color.green,
          style: 'dashed',
          title: 'TP',
          drag: { kind: 'positionTp', positionId: pos.id },
        });
      }
      if (pos.stopLoss) {
        lines.push({
          id: `pos:${pos.id}:sl`,
          price: pos.stopLoss,
          color: color.red,
          style: 'dashed',
          title: 'SL',
          drag: { kind: 'positionSl', positionId: pos.id },
        });
      }
      if (pos.liqPrice !== null && pos.liqPrice > 0) {
        lines.push({
          id: `pos:${pos.id}:liq`,
          price: pos.liqPrice,
          color: color.amber,
          style: 'dashed',
          title: 'Liq.',
        });
      }
    }
  }

  for (const order of input.pendingOrders) {
    if (order.category !== category || order.symbol !== symbol) continue;
    // A spot TP / SL leg is placed or cancelled, not edited (plan §8)
    const spotLeg = order.type === 'take-profit' || order.type === 'stop-loss';
    lines.push({
      id: `ord:${order.id}:price`,
      price: order.triggerPrice,
      color: color.purple,
      style: 'dotted',
      title: `${ORDER_LABEL[order.type]} ${fmtQty(order.qty)}`,
      ...(spotLeg ? {} : { drag: { kind: 'orderPrice' as const, orderId: order.id } }),
    });
    if (order.takeProfit) {
      lines.push({
        id: `ord:${order.id}:tp`,
        price: order.takeProfit,
        color: color.green,
        style: 'dotted',
        title: 'TP',
        drag: { kind: 'orderTp', orderId: order.id },
      });
    }
    if (order.stopLoss) {
      lines.push({
        id: `ord:${order.id}:sl`,
        price: order.stopLoss,
        color: color.red,
        style: 'dotted',
        title: 'SL',
        drag: { kind: 'orderSl', orderId: order.id },
      });
    }
  }

  if (category === 'linear' && input.showMark && input.mark !== null) {
    lines.push({
      id: 'mark',
      price: input.mark,
      color: color.muted,
      style: 'dotted',
      title: 'Mark',
    });
  }
  return lines;
}

/** The draggable line nearest to `y` (px), within `tolerance` px — or null. */
export function hitTestTradeLine(
  lines: { spec: TradeLineSpec; y: number | null }[],
  y: number,
  tolerance = 5
): TradeLineSpec | null {
  let best: TradeLineSpec | null = null;
  let bestDist = tolerance + 1;
  for (const { spec, y: lineY } of lines) {
    if (!spec.drag || lineY === null) continue;
    const dist = Math.abs(lineY - y);
    if (dist <= tolerance && dist < bestDist) {
      best = spec;
      bestDist = dist;
    }
  }
  return best;
}

/** Round a dragged price to the instrument's tick size (Bybit refuses off-tick prices). */
export function roundToTick(price: number, tick: number | null | undefined): number {
  if (!tick || !(tick > 0)) return price;
  const decimals = Math.max(0, Math.ceil(-Math.log10(tick)));
  return Number((Math.round(price / tick) * tick).toFixed(decimals));
}

/** "take-profit", "stop-loss" or "order price" — what a drag amends, for the confirmation. */
export function dragTargetLabel(target: DragTarget): string {
  switch (target.kind) {
    case 'positionTp':
    case 'orderTp':
      return 'take-profit';
    case 'positionSl':
    case 'orderSl':
      return 'stop-loss';
    case 'orderPrice':
      return 'order price';
  }
}
