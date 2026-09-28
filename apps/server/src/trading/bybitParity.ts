/**
 * API parity with Bybit v5 (APP_LOG Bybit Parity BP-5 G): the engine's wire shapes mapped onto
 * Bybit's field names, and a field-by-field comparison. Used by the manual testnet parity run
 * (src/tools/bybitParity.ts) — pure, no I/O, so it is unit-tested like the rest of the engine.
 *
 * Every value is a decimal string, as Bybit sends it. Fill prices can't match (there is no shared
 * order book), so the parity run feeds Bybit's own fill prices into the engine and compares the
 * maths that follows.
 */

import { Decimal } from '@prisma/client/runtime/client';
import type { PaperPositionDTO, PaperTradeDTO, PaperFundingDTO } from '@crypto-dashboard/sdk';
import type { AccountFigures } from './bybitSpec.js';

/** position/list — the fields the parity run compares. */
export interface BybitPositionV5 {
  symbol: string;
  side: 'Buy' | 'Sell';
  size: string;
  avgPrice: string;
  positionValue: string;
  leverage: string;
  liqPrice: string;
  bustPrice: string;
  positionIM: string;
  positionMM: string;
  takeProfit: string;
  stopLoss: string;
  tpTriggerBy: string;
  slTriggerBy: string;
  tpslMode: 'Full';
}

/** position/closed-pnl */
export interface BybitClosedPnlV5 {
  symbol: string;
  /** The closing order's side: Sell closed a long */
  side: 'Buy' | 'Sell';
  qty: string;
  closedSize: string;
  avgEntryPrice: string;
  avgExitPrice: string;
  cumEntryValue: string;
  cumExitValue: string;
  openFee: string;
  closeFee: string;
  closedPnl: string;
  execType: 'Trade' | 'BustTrade';
  updatedTime: string;
}

/** execution/list for a funding settlement */
export interface BybitFundingExecutionV5 {
  symbol: string;
  side: 'Buy' | 'Sell';
  execType: 'Funding';
  execQty: string;
  execPrice: string;
  feeRate: string;
  execFee: string;
  execTime: string;
}

/** account/wallet-balance (UTA) — the account-level margin figures */
export interface BybitWalletV5 {
  totalWalletBalance: string;
  totalPerpUPL: string;
  totalMarginBalance: string;
  totalInitialMargin: string;
  totalMaintenanceMargin: string;
  totalAvailableBalance: string;
  accountIMRate: string;
  accountMMRate: string;
}

const str = (v: string | undefined) => v ?? '';
const dec = (v: string) => new Decimal(v);

export function toBybitPosition(p: PaperPositionDTO): BybitPositionV5 {
  return {
    symbol: p.symbol,
    side: p.side === 'long' ? 'Buy' : 'Sell',
    size: p.quantity,
    avgPrice: p.entryPrice,
    positionValue: dec(p.quantity).times(p.entryPrice).toString(),
    leverage: String(p.leverage),
    liqPrice: str(p.liqPrice),
    bustPrice: str(p.bustPrice),
    positionIM: str(p.positionIM),
    positionMM: str(p.positionMM),
    // Bybit reports "" when unset
    takeProfit: str(p.takeProfit),
    stopLoss: str(p.stopLoss),
    tpTriggerBy: p.takeProfit ? (p.tpTriggerBy ?? 'LastPrice') : '',
    slTriggerBy: p.stopLoss ? (p.slTriggerBy ?? 'LastPrice') : '',
    tpslMode: 'Full',
  };
}

export function toBybitClosedPnl(t: PaperTradeDTO): BybitClosedPnlV5 {
  const qty = dec(t.quantity);
  return {
    symbol: t.symbol,
    side: t.side === 'long' ? 'Sell' : 'Buy',
    qty: t.quantity,
    closedSize: t.closedSize ?? t.quantity,
    avgEntryPrice: t.avgEntryPrice ?? t.entryPrice,
    avgExitPrice: t.avgExitPrice ?? t.exitPrice,
    cumEntryValue: qty.times(t.entryPrice).toString(),
    cumExitValue: qty.times(t.exitPrice).toString(),
    openFee: str(t.openFee),
    closeFee: str(t.closeFee),
    closedPnl: str(t.closedPnl),
    execType: t.execType === 'BustTrade' ? 'BustTrade' : 'Trade',
    updatedTime: String(t.closedAt),
  };
}

export function toBybitFundingExecution(f: PaperFundingDTO): BybitFundingExecutionV5 {
  return {
    symbol: f.symbol,
    // Bybit's execution side is the position's side for funding
    side: f.side === 'long' ? 'Buy' : 'Sell',
    execType: 'Funding',
    execQty: f.qty,
    execPrice: f.markPrice,
    feeRate: f.rate,
    execFee: f.fee,
    execTime: String(f.time),
  };
}

export function toBybitWallet(f: AccountFigures): BybitWalletV5 {
  const rate = (r: Decimal) => (r.isFinite() ? r.toDecimalPlaces(4).toString() : '');
  return {
    totalWalletBalance: f.walletBalance.toString(),
    totalPerpUPL: f.unrealisedPnl.toString(),
    totalMarginBalance: f.marginBalance.toString(),
    totalInitialMargin: f.totalIM.toString(),
    totalMaintenanceMargin: f.totalMM.toString(),
    totalAvailableBalance: f.available.toString(),
    accountIMRate: rate(f.imRate),
    accountMMRate: rate(f.mmRate),
  };
}

// ─── Comparison ────────────────────────────────────────────────────────────────

export interface FieldDiff {
  field: string;
  bybit: string;
  paper: string;
}

/**
 * The fields where Bybit and the paper engine disagree. Numbers are compared as decimals within
 * `tolerance` (absolute) — Bybit rounds to its own precision — other values exactly. Fields
 * missing on either side are reported, never silently skipped.
 */
/** True for a decimal string Bybit or the engine would send (never NaN / Infinity / ""). */
function isNumeric(v: string): boolean {
  if (v.trim() === '') return false;
  try {
    return new Decimal(v).isFinite();
  } catch {
    return false;
  }
}

export function diffFields(
  bybit: Record<string, unknown>,
  paper: Record<string, unknown>,
  fields: readonly string[],
  tolerance = '0.01'
): FieldDiff[] {
  const tol = new Decimal(tolerance);
  const diffs: FieldDiff[] = [];
  const valueOf = (o: Record<string, unknown>, f: string) =>
    Object.prototype.hasOwnProperty.call(o, f)
      ? String(Object.getOwnPropertyDescriptor(o, f)?.value ?? '')
      : undefined;
  for (const field of fields) {
    const b = valueOf(bybit, field);
    const p = valueOf(paper, field);
    if (b === undefined || p === undefined) {
      diffs.push({ field, bybit: b ?? '(missing)', paper: p ?? '(missing)' });
      continue;
    }
    const same = isNumeric(b) && isNumeric(p) ? new Decimal(b).minus(p).abs().lte(tol) : b === p;
    if (!same) diffs.push({ field, bybit: b, paper: p });
  }
  return diffs;
}
