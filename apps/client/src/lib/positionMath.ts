/**
 * USDT Perpetual position figures for display (APP_LOG Bybit Parity BP-3) — pure, no React.
 *
 * Bybit values a perpetual position at the **mark** price: unrealised PnL and liquidation use it,
 * never the last traded price. The liquidation / bankruptcy prices, IM and MM come from the
 * server (Bybit's isolated-margin maths); this only combines them with a live price.
 */

import {
  accountFiguresEstimate,
  crossLiqPriceEstimate,
  estimatePositionRisk,
  linearTickSize,
  feeToCloseEstimate,
  positionCapEstimate,
  riskTiersFor,
  tierIndexEstimate,
} from '@crypto-dashboard/sdk';
import type { AccountFiguresEstimate } from '@crypto-dashboard/sdk';
import type { ClosedTrade, PendingOrder, Position } from '@/store/paperStore';
import { fmtUsd } from './format';

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
    | 'side'
    | 'entryPrice'
    | 'quantity'
    | 'entryUsdtAmount'
    | 'closeFeeReserve'
    | 'positionMM'
    | 'extraMargin'
  >,
  mark: number
): number | null {
  // Unknown (a pre-BP-3 server sent no MM): no rate rather than a falsely safe 0%
  if (pos.positionMM === null) return null;
  // From the parts, not positionIM: that includes the added margin since 2026-09-28 (an older
  // server's doesn't), so this reads the same from either
  const equity =
    pos.entryUsdtAmount + pos.closeFeeReserve + pos.extraMargin + positionPnl(pos, mark);
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
  symbol: string,
  /** The live instrument tick; the SDK snapshot when absent */
  tickSize?: number
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
      tickSize: tickSize && tickSize > 0 ? tickSize : linearTickSize(symbol),
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
  symbol: string,
  /** The live instrument tick; the SDK snapshot when absent */
  tickSize?: number
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
      tickSize: tickSize && tickSize > 0 ? tickSize : linearTickSize(symbol),
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

// ─── Closed P&L (BP-5 D) ───────────────────────────────────────────────────────

const fmtUsd4 = (n: number) => fmtUsd(n, 4);

/** Closed P&L as the server computed it; a pre-BP-5 server sent only the gross PnL and funding */
export function closedPnlOf(t: ClosedTrade): number {
  return t.closedPnl ?? t.pnl - (t.funding ?? 0);
}

/** "Open fee $1.3750 · Close fee $1.4025 · Funding $0.0000" */
export function closedPnlBreakdown(t: ClosedTrade): string {
  const part = (label: string, v: number | undefined) =>
    `${label} ${v === undefined ? '—' : fmtUsd4(v)}`;
  return [
    part('Open fee', t.openFee),
    part('Close fee', t.closeFee),
    part('Funding', t.funding ?? 0),
  ].join(' · ');
}

// ─── Cross margin (BP-5 E) ─────────────────────────────────────────────────────

/** Wallet, positions and orders — what the cross account figures are computed from. */
export interface CrossAccountInput {
  balance: number;
  positions: Position[];
  pendingOrders: PendingOrder[];
}

const crossInput = (pos: Position, mark: number | null) => ({
  side: pos.side,
  qty: pos.quantity,
  entryPrice: pos.entryPrice,
  leverage: pos.leverage,
  mark: mark ?? pos.entryPrice,
  tiers: riskTiersFor(pos.symbol),
});

/**
 * Bybit's cross account figures, live: the wallet (free USDT + what positions and orders hold)
 * and every position at `markOf` (its entry price when unknown). Mirrors the server's
 * bybitSpec.accountFigures.
 */
export function crossAccountFigures(
  s: CrossAccountInput,
  markOf: (symbol: string) => number | null
): AccountFiguresEstimate {
  const linearOrders = s.pendingOrders.filter((o) => o.category === 'linear');
  let wallet = s.balance;
  for (const p of s.positions) wallet += p.entryUsdtAmount + p.closeFeeReserve + p.extraMargin;
  for (const o of linearOrders) wallet += o.reserved;
  return accountFiguresEstimate(
    wallet,
    s.positions.map((p) => crossInput(p, markOf(p.symbol))),
    linearOrders.reduce((sum, o) => sum + o.reserved, 0)
  );
}

/** A cross position's estimated liquidation price (every other position held constant). */
export function crossLiqPrice(
  pos: Position,
  mark: number | null,
  figures: AccountFiguresEstimate
): number {
  return crossLiqPriceEstimate(crossInput(pos, mark), figures);
}

/**
 * The order form's estimated liquidation price in cross: the position this order would leave
 * (merged with an open one on the same side), with the account's other positions at their marks
 * and the wallet less the open fee. Null when the order reduces or flips a position (not
 * estimated) or nothing is sized yet.
 */
export function crossOrderLiqEstimate(
  s: CrossAccountInput,
  markOf: (symbol: string) => number | null,
  order: {
    symbol: string;
    side: 'long' | 'short';
    qty: number;
    price: number;
    leverage: number;
    openFee: number;
  }
): number | null {
  if (!(order.qty > 0) || !(order.price > 0)) return null;
  const existing = s.positions.find((p) => p.symbol === order.symbol);
  if (existing && existing.side !== order.side) return null;
  const qty = (existing?.quantity ?? 0) + order.qty;
  const entry = existing
    ? (existing.quantity * existing.entryPrice + order.qty * order.price) / qty
    : order.price;
  const now = crossAccountFigures(s, markOf);
  const others = s.positions.filter((p) => p.symbol !== order.symbol);
  const merged = {
    side: order.side,
    qty,
    entryPrice: entry,
    leverage: order.leverage,
    mark: markOf(order.symbol) ?? order.price,
    tiers: riskTiersFor(order.symbol),
  };
  const linearOrders = s.pendingOrders.filter((o) => o.category === 'linear');
  const figures = accountFiguresEstimate(
    now.walletBalance - order.openFee,
    [...others.map((p) => crossInput(p, markOf(p.symbol))), merged],
    linearOrders.reduce((sum, o) => sum + o.reserved, 0)
  );
  return crossLiqPriceEstimate(merged, figures);
}

/** Cross margin, for the mode modal: one bad position can use the whole balance. */
export const CROSS_EXPLAINER =
  'Cross margin: your whole available balance backs every position, and unrealised profit can ' +
  'open new ones. If the account maintenance margin rate reaches 100%, positions are liquidated ' +
  '— and a big loss can take the whole balance, not just one position margin.';

/** Isolated margin, for the mode modal. */
export const ISOLATED_EXPLAINER =
  'Isolated margin: each position has its own margin. A liquidation loses only that margin; ' +
  'you can add or reduce it per position.';
