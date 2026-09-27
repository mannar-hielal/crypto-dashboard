/**
 * Isolated-margin helpers for engine positions (BYBIT_PARITY_PLAN BP-3). The formulas live in
 * ../bybitSpec.ts; this adapts an engine Position to them.
 */

import { fallbackRiskTiers, positionRisk, type PositionRisk, type RiskTier } from '../bybitSpec.js';
import { ZERO } from './draft.js';
import type { EngineContext, Position } from './types.js';

/** The risk-limit tiers the context supplies for `symbol`, else the bundled snapshot. */
export function tiersFor(ctx: Pick<EngineContext, 'riskTiers'>, symbol: string): RiskTier[] {
  const tiers = ctx.riskTiers?.(symbol);
  return tiers && tiers.length > 0 ? tiers : fallbackRiskTiers(symbol);
}

/** Bybit's liquidation / bankruptcy prices, IM and MM for a position. */
export function riskOf(
  pos: Pick<
    Position,
    'side' | 'quantity' | 'entryPrice' | 'entryUsdtAmount' | 'closeFeeReserve' | 'extraMargin'
  >,
  tiers: RiskTier[]
): PositionRisk {
  return positionRisk(
    {
      side: pos.side,
      quantity: pos.quantity,
      entryPrice: pos.entryPrice,
      im: pos.entryUsdtAmount,
      closeFeeReserve: pos.closeFeeReserve,
      extraMargin: pos.extraMargin ?? ZERO,
    },
    tiers
  );
}
