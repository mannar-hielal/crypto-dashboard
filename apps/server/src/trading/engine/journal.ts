/**
 * Journal entry builders — every system journal text the browser engine wrote, word for word
 * (apps/client/src/store/paperStore.ts and hooks/usePendingOrderMonitor.ts). Users see the same
 * journal after the move to the server.
 */

import type { Decimal } from '@prisma/client/runtime/client';
import {
  fmtPrice,
  isSameNumber,
  isSameOptional,
  pendingSideLabel,
  pendingTypeLabel,
} from './format.js';
import type { JournalEntry, PendingOrder, Position } from './types.js';

export function systemEntry(id: string, time: number, text: string, pnl?: Decimal): JournalEntry {
  return { id, time, text, isUserNote: false, ...(pnl !== undefined ? { pnl } : {}) };
}

function exitSummaryPart(
  label: 'TP' | 'SL',
  previous: Decimal | null,
  next: Decimal | null
): string | null {
  if (isSameOptional(previous, next)) return null;
  if (previous === null && next !== null) return `${label} set to $${fmtPrice(next)}`;
  if (previous !== null && next === null) return `${label} removed`;
  if (previous !== null && next !== null) {
    return `${label} $${fmtPrice(previous)} → $${fmtPrice(next)}`;
  }
  return null;
}

/** paperStore.ts buildPositionExitJournalEntries */
export function positionExitEditEntries(
  pos: Position,
  takeProfit: Decimal | null,
  stopLoss: Decimal | null,
  now: number
): JournalEntry[] {
  const prevTp = pos.takeProfit ?? null;
  const prevSl = pos.stopLoss ?? null;
  const tpChanged = !isSameOptional(prevTp, takeProfit);
  const slChanged = !isSameOptional(prevSl, stopLoss);
  const summary = [
    exitSummaryPart('TP', prevTp, takeProfit),
    exitSummaryPart('SL', prevSl, stopLoss),
  ].filter((p): p is string => !!p);

  if (!tpChanged && !slChanged) return [];
  const side = pos.side.toUpperCase();
  const entries: JournalEntry[] = [];

  if (slChanged) {
    entries.push(
      systemEntry(
        `j-edit-exits-sl-${pos.id}-${now}`,
        now,
        stopLoss === null
          ? `Stop-Loss cancelled for ${side} ${pos.symbol} @ $${fmtPrice(prevSl as Decimal)}`
          : prevSl === null
            ? `Stop-Loss order added for ${side} ${pos.symbol} @ $${fmtPrice(stopLoss)}`
            : `Stop-Loss modification confirmed — ${side} ${pos.symbol} @ $${fmtPrice(stopLoss)}`
      )
    );
  }
  if (tpChanged) {
    entries.push(
      systemEntry(
        `j-edit-exits-tp-${pos.id}-${now}`,
        now,
        takeProfit === null
          ? `Take-Profit cancelled for ${side} ${pos.symbol} @ $${fmtPrice(prevTp as Decimal)}`
          : prevTp === null
            ? `Take-Profit order added for ${side} ${pos.symbol} @ $${fmtPrice(takeProfit)}`
            : `Take-Profit modification confirmed — ${side} ${pos.symbol} @ $${fmtPrice(takeProfit)}`
      )
    );
  }
  if (summary.length) {
    entries.push(
      systemEntry(
        `j-edit-exits-summary-${pos.id}-${now}`,
        now,
        `Modified ${side} ${pos.symbol} exits — ${summary.join(', ')}`
      )
    );
  }
  return entries;
}

/** paperStore.ts buildPendingOrderEditJournalEntries */
export function pendingEditEntries(
  order: PendingOrder,
  newTrigger: Decimal,
  newUsdt: Decimal,
  newQty: Decimal,
  newTp: Decimal | null,
  newSl: Decimal | null,
  now: number
): JournalEntry[] {
  const prevTp = order.takeProfit ?? null;
  const prevSl = order.stopLoss ?? null;
  const side = pendingSideLabel(order.side);
  const entries: JournalEntry[] = [];
  const summary: string[] = [];

  if (!isSameNumber(order.triggerPrice, newTrigger)) {
    summary.push(`price $${fmtPrice(order.triggerPrice)} → $${fmtPrice(newTrigger)}`);
  }
  if (!isSameNumber(order.qty, newQty)) {
    summary.push(`qty ${order.qty.toFixed(6)} → ${newQty.toFixed(6)}`);
  }
  if (!isSameNumber(order.usdtAmount, newUsdt)) {
    summary.push(`reserved $${order.usdtAmount.toFixed(2)} → $${newUsdt.toFixed(2)}`);
  }
  const tpPart = exitSummaryPart('TP', prevTp, newTp);
  if (tpPart) summary.push(tpPart);
  const slPart = exitSummaryPart('SL', prevSl, newSl);
  if (slPart) summary.push(slPart);

  if (!isSameOptional(prevSl, newSl)) {
    entries.push(
      systemEntry(
        `j-edit-pending-sl-${order.id}-${now}`,
        now,
        newSl === null
          ? `Stop-Loss cancelled for pending ${side} ${order.symbol} @ $${fmtPrice(prevSl as Decimal)}`
          : prevSl === null
            ? `Stop-Loss order added for pending ${side} ${order.symbol} @ $${fmtPrice(newSl)}`
            : `Stop-Loss modification confirmed for pending ${side} ${order.symbol} @ $${fmtPrice(newSl)}`
      )
    );
  }
  if (!isSameOptional(prevTp, newTp)) {
    entries.push(
      systemEntry(
        `j-edit-pending-tp-${order.id}-${now}`,
        now,
        newTp === null
          ? `Take-Profit cancelled for pending ${side} ${order.symbol} @ $${fmtPrice(prevTp as Decimal)}`
          : prevTp === null
            ? `Take-Profit order added for pending ${side} ${order.symbol} @ $${fmtPrice(newTp)}`
            : `Take-Profit modification confirmed for pending ${side} ${order.symbol} @ $${fmtPrice(newTp)}`
      )
    );
  }
  if (summary.length) {
    entries.push(
      systemEntry(
        `j-edit-pending-summary-${order.id}-${now}`,
        now,
        `Modified ${pendingTypeLabel(order.type)} ${side} ${order.symbol} — ${summary.join(', ')}`
      )
    );
  }
  return entries;
}
