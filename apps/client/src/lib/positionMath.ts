/**
 * USDT Perpetual position figures for display (BYBIT_PARITY_PLAN BP-3) — pure, no React.
 *
 * Bybit values a perpetual position at the **mark** price: unrealised PnL and liquidation use it,
 * never the last traded price. The liquidation / bankruptcy prices, IM and MM come from the
 * server (Bybit's isolated-margin maths); this only combines them with a live price.
 */

import { estimatePositionRisk, feeToCloseEstimate, riskTiersFor } from '@crypto-dashboard/sdk';
import type { Position } from '@/store/paperStore';

/** Unrealised PnL of a position at `price` (the mark price for Bybit parity). */
export function positionPnl(
  pos: Pick<Position, 'side' | 'entryPrice' | 'quantity'>,
  price: number
) {
  return pos.side === 'long'
    ? (price - pos.entryPrice) * pos.quantity
    : (pos.entryPrice - price) * pos.quantity;
}

/**
 * Bybit's position maintenance-margin rate: MM ÷ (position margin + unrealised PnL). At 100% the
 * position's equity has fallen to its maintenance margin — that is the liquidation price.
 * Returns 0…1+ (can exceed 1 between a mark tick and the server's liquidation).
 */
export function positionMmrRate(
  pos: Pick<
    Position,
    'side' | 'entryPrice' | 'quantity' | 'positionIM' | 'positionMM' | 'extraMargin'
  >,
  mark: number
): number | null {
  // Unknown (a pre-BP-3 server sent no MM): no rate rather than a falsely safe 0%
  if (pos.positionMM === null) return null;
  const equity = pos.positionIM + pos.extraMargin + positionPnl(pos, mark);
  if (equity <= 0) return 1;
  return Math.max(0, pos.positionMM / equity);
}

/** What the explainer ⓘ on a liquidation price says (order form and Positions tab). */
export const LIQUIDATION_EXPLAINER =
  'Liquidation price: when the mark price reaches it, the position is liquidated — closed at the ' +
  'bankruptcy price, where its whole margin is used up, and that margin is lost. The mark price ' +
  "is Bybit's fair price (it follows the index, not the last trade), so a brief spike in the " +
  'last price alone does not liquidate you. Keep a stop-loss before the liquidation price, or use ' +
  'lower leverage, to stay clear of it. Isolated margin: only this position’s margin is at risk.';

/** What the explainer ⓘ on the MMR column says. */
export const MMR_EXPLAINER =
  'MMR (maintenance margin rate) = maintenance margin ÷ (position margin + unrealised PnL), at ' +
  'the mark price — as Bybit shows it. At 100% the position is liquidated.';

/**
 * What a leverage change would do to an open position (Bybit re-margining, BP-3): the new
 * position margin (IM + fee to close at the new bankruptcy price) and the new liquidation price.
 * The server decides; this is the preview in the leverage modal.
 */
export function remarginPreview(
  pos: Pick<Position, 'side' | 'quantity' | 'entryPrice' | 'extraMargin'>,
  leverage: number,
  symbol: string
): { margin: number; liqPrice: number } {
  const lev = Math.max(1, leverage);
  const im = (pos.quantity * pos.entryPrice) / lev;
  const closeFeeReserve = feeToCloseEstimate(pos.side, pos.quantity, pos.entryPrice, lev);
  const risk = estimatePositionRisk(
    {
      side: pos.side,
      qty: pos.quantity,
      entryPrice: pos.entryPrice,
      leverage: lev,
      im,
      closeFeeReserve,
      extraMargin: pos.extraMargin,
    },
    riskTiersFor(symbol)
  );
  return { margin: im + closeFeeReserve, liqPrice: risk.liqPrice };
}
