/**
 * Clone and copy / paste of drawings (TradingView: Clone, Ctrl/Cmd+C, Ctrl/Cmd+V). The clipboard
 * is in memory and shared by the panes, so a copy can be pasted into another pane or symbol. Copies
 * land a little right of and below the originals, unlocked and selected, so they're easy to spot
 * and drag; undo removes them in one step.
 */

import type { Drawing, DrawingManager } from 'lightweight-charts-drawing';

/** How far a copy lands from its original, in pane pixels */
export const COPY_OFFSET_PX = 20;

let clipboard: readonly Drawing[] = [];

function selectedDrawings(manager: DrawingManager): Drawing[] {
  return manager.selection().flatMap((id) => manager.get(id) ?? []);
}

/** Copy the selection; returns how many drawings were copied (0 = nothing selected, clipboard kept) */
export function copySelection(manager: DrawingManager): number {
  const picked = selectedDrawings(manager);
  if (picked.length > 0) clipboard = picked;
  return picked.length;
}

/** Paste the clipboard into `manager`; returns the new ids (none when the clipboard is empty) */
export function pasteClipboard(manager: DrawingManager): string[] {
  if (clipboard.length === 0) return [];
  return manager.insertCopies(clipboard, COPY_OFFSET_PX, COPY_OFFSET_PX);
}

/** Clone the selection in place (offset); returns the new ids */
export function cloneSelection(manager: DrawingManager): string[] {
  const picked = selectedDrawings(manager);
  return picked.length > 0 ? manager.insertCopies(picked, COPY_OFFSET_PX, COPY_OFFSET_PX) : [];
}

export function hasClipboard(): boolean {
  return clipboard.length > 0;
}

/** Tests only: forget the clipboard */
export function resetClipboard(): void {
  clipboard = [];
}
