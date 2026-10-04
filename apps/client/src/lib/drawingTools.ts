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
