/**
 * Formatting helpers used in journal / balance-history text. Ported from
 * apps/client/src/lib/utils.ts (fmtPrice) and the label helpers in paperStore.ts, so the
 * wording users see is unchanged by the server port.
 */

import { Decimal } from '@prisma/client/runtime/client';
import type { OrderSide, PendingType } from './types.js';

/** ≥ 1000 → 2 dp, ≥ 1 → 4 dp, otherwise 6 dp (TradingView style). */
export function fmtPrice(price: Decimal): string {
  if (price.gte(1000)) return price.toFixed(2);
  if (price.gte(1)) return price.toFixed(4);
  return price.toFixed(6);
}

export function pendingSideLabel(side: OrderSide): 'Long' | 'Short' {
  return side === 'buy' ? 'Long' : 'Short';
}

export function pendingTypeLabel(
  type: PendingType
): 'LIMIT' | 'STOP' | 'TAKE-PROFIT' | 'STOP-LOSS' {
  if (type === 'limit') return 'LIMIT';
  if (type === 'stop') return 'STOP';
  return type === 'take-profit' ? 'TAKE-PROFIT' : 'STOP-LOSS';
}

/** The browser engine's float tolerance for "did this value change". */
export function isSameNumber(a: Decimal, b: Decimal): boolean {
  return a.minus(b).abs().lt(new Decimal('1e-9'));
}

export function isSameOptional(a: Decimal | null, b: Decimal | null): boolean {
  if (a === null || b === null) return a === b;
  return isSameNumber(a, b);
}
