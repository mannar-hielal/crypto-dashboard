/**
 * Toolbar tools around the drawing library: the ones the library doesn't know (Eraser, zoom-in)
 * and how they share the active-tool state with it. Used by DashboardPage and ChartPanel.
 */

import type { DrawingManager } from 'lightweight-charts-drawing';

/** Toolbar tools that aren't library tools: the library never arms them */
export const HOST_TOOLS: ReadonlySet<string> = new Set(['zoom-in', 'eraser']);

/**
 * The active tool after the library reports `kind` (its `tool` event). The library's null — it
 * disarmed — never ends a host tool: disarming it is how the Eraser starts.
 */
export function nextActiveTool(prev: string | null, kind: string | null): string | null {
  return kind === null && prev !== null && HOST_TOOLS.has(prev) ? prev : kind;
}

/**
 * The Eraser (TradingView): a click on a drawing removes it. Locked drawings stay, as with
 * Delete. Disarms the library's tool and clears the selection; returns the off switch.
 */
export function startEraser(manager: DrawingManager): () => void {
  if (manager.tool() !== null) manager.setTool(null);
  manager.select([]);
  // A press on a drawing selects it: that is the click to erase
  return manager.on('selection', (ids) => {
    for (const id of ids) if (!manager.get(id)?.locked) manager.remove(id);
  });
}

/**
 * One pane holds the drawing selection: a selection in `owner` clears every other pane's. The
 * library's Delete listens on the window, so this keeps Delete to the pane last clicked.
 * Returns the off switch.
 */
export function keepSelectionInOnePane(
  owner: DrawingManager,
  panes: () => readonly (DrawingManager | null)[]
): () => void {
  return owner.on('selection', (ids) => {
    if (ids.length === 0) return;
    for (const m of panes()) if (m && m !== owner && m.selection().length > 0) m.select([]);
  });
}

/**
 * A pane's manager joins the dashboard: it goes into `panes[paneIndex]`, its `tool` events reach
 * `onTool`, and its selection clears the other panes' (keepSelectionInOnePane). Returns the
 * cleanup for when the pane's chart goes: listeners off, and the slot emptied if it still holds
 * this manager (a remount may already have put the next one there).
 */
export function connectPaneManager(
  panes: (DrawingManager | null)[],
  paneIndex: number,
  manager: DrawingManager,
  onTool: (kind: string | null) => void
): () => void {
  panes[paneIndex] = manager;
  const offTool = manager.on('tool', onTool);
  const offSelection = keepSelectionInOnePane(manager, () => panes);
  return () => {
    offTool();
    offSelection();
    if (panes[paneIndex] === manager) panes[paneIndex] = null;
  };
}
