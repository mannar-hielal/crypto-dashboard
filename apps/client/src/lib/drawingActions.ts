/**
 * What the drawing controls do to a pane's selection: TradingView's right-click / More actions and
 * the floating toolbar's style changes. Edits made in one task are one undo step (drawingHistory).
 */

import type { Drawing, DrawingManager, DrawingStyle } from 'lightweight-charts-drawing';
import { cloneSelection, copySelection } from '@/lib/drawingClipboard';

/** 🔐 A drawing's text is bounded: the set is saved to localStorage on every edit, and a huge
 *  paste would fill the quota and silently stop every later save */
export const MAX_DRAWING_TEXT = 2000;

/** The floating toolbar's More menu */
export type DrawingAction = 'clone' | 'copy' | 'front' | 'back' | 'hide';

/** What a right-click on a drawing offers (TradingView's order) */
export type DrawingMenuAction = DrawingAction | 'settings' | 'lock' | 'remove';

/** Apply `action` to the manager's selection */
export function runDrawingAction(manager: DrawingManager, action: DrawingMenuAction): void {
  const selected = manager.selection().flatMap((id) => manager.get(id) ?? []);
  if (action === 'clone') cloneSelection(manager);
  else if (action === 'copy') copySelection(manager);
  else if (action === 'front') for (const d of selected) manager.bringToFront(d.id);
  else if (action === 'back') for (const d of [...selected].reverse()) manager.sendToBack(d.id);
  else if (action === 'hide') {
    for (const d of selected) manager.update({ ...d, hidden: true });
    manager.select([]);
  } else if (action === 'lock') {
    const lock = !selected.every((d) => d.locked);
    for (const d of selected) manager.update({ ...d, locked: lock });
  } else if (action === 'remove') {
    for (const d of selected) manager.remove(d.id);
  }
}

/** A style patch onto every selected drawing (one undo step: the history records after the task) */
export function styleSelection(manager: DrawingManager, patch: Partial<DrawingStyle>): void {
  for (const id of manager.selection()) {
    const d = manager.get(id);
    if (d) manager.update({ ...d, style: { ...d.style, ...patch } } as Drawing);
  }
}

/** "83,119.5" → 83119.5; anything that isn't a finite number → null */
export function parseDecimal(raw: string): number | null {
  const n = Number(raw.replace(/,/g, '').trim());
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
}
