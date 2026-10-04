/**
 * Undo / redo for one pane's drawings (TradingView Ctrl/Cmd+Z, Ctrl/Cmd+Y or Shift+Z).
 *
 * The history keeps snapshots of the manager's drawing list. The library replaces the list on every
 * edit, so a snapshot is the list itself (no copy). A drag is one step: changes during a pointer
 * gesture (`busy()`) are recorded once at `gestureEnd`; any other edit (Delete, Remove all, a
 * style change, paste) is recorded after the current task. Loading a symbol's set or copying
 * another pane's edit (`isExternal`) starts the history over: undo never reaches into another
 * pane's or symbol's drawings.
 */

import type { Drawing, DrawingManager } from 'lightweight-charts-drawing';

/** Steps kept per pane — 🔐 bounded so a long session can't grow the history without limit */
export const MAX_UNDO_STEPS = 100;

export interface DrawingHistory {
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Listeners off; the history stops recording */
  destroy(): void;
}

export function createDrawingHistory(
  manager: DrawingManager,
  isExternal: () => boolean = () => false
): DrawingHistory {
  let past: (readonly Drawing[])[] = [];
  let future: (readonly Drawing[])[] = [];
  let current: readonly Drawing[] = manager.drawings();
  let applying = false;
  let scheduled = false;
  let destroyed = false;

  function record(): void {
    scheduled = false;
    if (destroyed) return;
    const list = manager.drawings();
    if (list === current) return;
    past = [...past, current].slice(-MAX_UNDO_STEPS);
    future = [];
    current = list;
  }

  function apply(list: readonly Drawing[]): void {
    applying = true;
    try {
      manager.importJSON(list);
    } finally {
      applying = false;
    }
    current = manager.drawings();
  }

  const offChange = manager.on('change', () => {
    if (applying) return;
    if (isExternal()) {
      past = [];
      future = [];
      current = manager.drawings();
      return;
    }
    if (manager.busy() || scheduled) return;
    scheduled = true;
    queueMicrotask(record);
  });
  const offGesture = manager.on('gestureEnd', record);

  return {
    undo() {
      record();
      const prev = past.at(-1);
      if (!prev) return false;
      past = past.slice(0, -1);
      future = [...future, current];
      apply(prev);
      return true;
    },
    redo() {
      record();
      const next = future.at(-1);
      if (!next) return false;
      future = future.slice(0, -1);
      past = [...past, current];
      apply(next);
      return true;
    },
    canUndo: () => !destroyed && (past.length > 0 || manager.drawings() !== current),
    canRedo: () => future.length > 0,
    destroy() {
      destroyed = true;
      past = [];
      future = [];
      offChange();
      offGesture();
    },
  };
}
