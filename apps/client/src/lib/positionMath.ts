/**
 * USDT Perpetual position figures for display (BYBIT_PARITY_PLAN BP-3) — pure, no React.
 *
 * Bybit values a perpetual position at the **mark** price: unrealised PnL and liquidation use it,
 * never the last traded price. The liquidation / bankruptcy prices, IM and MM come from the
 * server (Bybit's isolated-margin maths); this only combines them with a live price.
 */

import {
  estimatePositionRisk,
  feeToCloseEstimate,
  positionCapEstimate,
  riskTiersFor,
  tierIndexEstimate,
} from '@crypto-dashboard/sdk';
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
 * The liquidation price after adding (amount > 0) or reducing (amount < 0) an isolated position's
 * margin by hand (BP-5): the leverage and IM are unchanged, only the extra margin moves.
 */
export function adjustMarginPreview(
  pos: Pick<
    Position,
    | 'side'
    | 'quantity'
    | 'entryPrice'
    | 'leverage'
    | 'entryUsdtAmount'
    | 'closeFeeReserve'
    | 'extraMargin'
  >,
  amount: number,
  symbol: string
): { liqPrice: number; extraMargin: number } {
  const extraMargin = Math.max(0, pos.extraMargin + amount);
  const risk = estimatePositionRisk(
    {
      side: pos.side,
      qty: pos.quantity,
      entryPrice: pos.entryPrice,
      leverage: pos.leverage,
      im: pos.entryUsdtAmount,
      closeFeeReserve: pos.closeFeeReserve,
      extraMargin,
    },
    riskTiersFor(symbol)
  );
  return { liqPrice: risk.liqPrice, extraMargin };
}

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

/** Risk-limit tier facts for the leverage modal and the MMR hover (BP-5 C, O6). */
export interface RiskTierInfo {
  /** 1-based, as Bybit numbers its tiers */
  tierNo: number;
  mmr: number;
  /** The tier's upper position value (USDT) */
  limit: number;
  /** Largest position value allowed at the leverage — null when no tier allows it */
  cap: number | null;
}

/**
 * The tier a position of `positionValue` USDT is in (0 = no position: the first tier) and the
 * position-value cap at `leverage`, from the bundled tier snapshot. Null for an unknown symbol.
 */
export function riskTierInfo(
  symbol: string,
  positionValue: number,
  leverage: number
): RiskTierInfo | null {
  const tiers = riskTiersFor(symbol);
  if (!tiers.length) return null;
  const i = tierIndexEstimate(tiers, positionValue);
  return {
    tierNo: i + 1,
    mmr: tiers[i].mmr,
    limit: tiers[i].riskLimitValue,
    cap: positionCapEstimate(tiers, leverage),
  };
}

/** "Risk-limit tier 1 (up to 2,000,000 USDT) · MMR 0.5%" */
export function riskTierLabel(info: RiskTierInfo): string {
  const pct = Number((info.mmr * 100).toFixed(4));
  return `Risk-limit tier ${info.tierNo} (up to ${info.limit.toLocaleString('en-US')} USDT) · MMR ${pct}%`;
}
