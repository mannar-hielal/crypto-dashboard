/**
 * Isolated-margin helpers for engine positions (APP_LOG Bybit Parity BP-3). The formulas live in
 * ../bybitSpec.ts; this adapts an engine Position to them.
 */

import type { Decimal } from '@prisma/client/runtime/client';
import {
  accountFigures,
  fallbackRiskTiers,
  fallbackRules,
  positionRisk,
  type AccountFigures,
  type PositionRisk,
  type RiskTier,
} from '../bybitSpec.js';
import { ZERO } from './draft.js';
import type { EngineContext, PendingOrder, Position } from './types.js';

/** The risk-limit tiers the context supplies for `symbol`, else the bundled snapshot. */
export function tiersFor(ctx: Pick<EngineContext, 'riskTiers'>, symbol: string): RiskTier[] {
  const tiers = ctx.riskTiers?.(symbol);
  return tiers && tiers.length > 0 ? tiers : fallbackRiskTiers(symbol);
}

/** Bybit's liquidation / bankruptcy prices, IM and MM for a position. */
export function riskOf(
  pos: Pick<
    Position,
    | 'symbol'
    | 'side'
    | 'quantity'
    | 'entryPrice'
    | 'entryUsdtAmount'
    | 'closeFeeReserve'
    | 'extraMargin'
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
      // Bybit rounds the liquidation price to the tick; tick sizes are the dated snapshot (they
      // almost never change)
      tickSize: fallbackRules('linear', pos.symbol).tickSize,
    },
    tiers
  );
}

// ─── Cross margin (BP-5 E) ─────────────────────────────────────────────────────

/**
 * Bybit's wallet balance: the free USDT plus what the USDT Perpetual positions and orders hold
 * (their margin is bookkept out of `balance`, in either mode). Spot orders lock their own funds
 * and are not collateral.
 */
export function walletBalance(
  balance: Decimal,
  positions: Position[],
  orders: PendingOrder[]
): Decimal {
  let wallet = balance;
  for (const p of positions) {
    wallet = wallet
      .plus(p.entryUsdtAmount)
      .plus(p.closeFeeReserve)
      .plus(p.extraMargin ?? ZERO);
  }
  for (const o of orders) if (o.category === 'linear') wallet = wallet.plus(o.reserved);
  return wallet;
}

/**
 * The cross account figures (bybitSpec.accountFigures): every position at the context's mark
 * price (its entry price when no mark is known — no unrealised PnL), the orders' IM at what they
 * reserve.
 */
export function crossFigures(
  s: { balance: Decimal; positions: Position[]; orders: PendingOrder[] },
  ctx: Pick<EngineContext, 'riskTiers' | 'markPrice'>
): AccountFigures {
  const linearOrders = s.orders.filter((o) => o.category === 'linear');
  return accountFigures(
    walletBalance(s.balance, s.positions, linearOrders),
    s.positions.map((p) => ({
      side: p.side,
      quantity: p.quantity,
      entryPrice: p.entryPrice,
      leverage: p.leverage,
      mark: ctx.markPrice?.(p.symbol) ?? p.entryPrice,
      tiers: tiersFor(ctx, p.symbol),
    })),
    linearOrders.reduce((sum, o) => sum.plus(o.reserved), ZERO)
  );
}
