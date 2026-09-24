import { DrawingManager, ToolRegistry } from 'lightweight-charts-drawing';
import type { SerializedDrawing } from 'lightweight-charts-drawing';

// 🔐 Hard cap on persisted drawings per symbol — prevents unbounded localStorage
//    growth from an untracked drawing spree (and keeps the restore cost bounded).
const MAX_DRAWINGS = 200;

// Short debounce so drag updates (drawing:updated fires per anchor move) don't
// re-serialize the full drawing set on every pointermove.
const PERSIST_DEBOUNCE_MS = 150;
// 🔐 Keyed by DrawingManager instance, not by symbol string. Two panes can
// show the same symbol at once, each with its own DrawingManager — keying by
// symbol alone made them share one timer, so editing pane B would
// clearTimeout() and silently drop pane A's still-pending save. Keying by
// instance makes every pane's debounce independent regardless of what symbol
// any of them are currently showing.
const persistTimers = new WeakMap<DrawingManager, ReturnType<typeof setTimeout>>();

export const TOOL_MAP: Record<string, string> = {
  trendline: 'trend-line',
  horizontal: 'horizontal-line',
  vertical: 'vertical-line',
  ray: 'ray',
  parallel: 'parallel-channel',
  polyline: 'polyline',
  text: 'text-annotation',
  note: 'note',
  callout: 'callout',
  priceNote: 'price-note',
  priceLabel: 'price-label',
};

export function getPersistenceKey(symbol: string): string {
  return `cd-drawings-${symbol}`;
}

export function restoreDrawings(manager: DrawingManager, symbol: string) {
  const key = getPersistenceKey(symbol);
  const saved = localStorage.getItem(key);
  if (!saved) return;

  let data: SerializedDrawing[];
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    data = parsed as SerializedDrawing[];
  } catch {
    // Not valid JSON at all — nothing recoverable here.
    localStorage.removeItem(key);
    return;
  }

  // 🔐 Import one drawing at a time instead of manager.importDrawings(data, ...)
  //    — that runs the whole array through a single factory call and aborts
  //    on the first exception, which the outer try/catch used to turn into
  //    "delete every saved drawing for this symbol" for a single corrupted
  //    or no-longer-supported entry. Skip just the bad one instead.
  const registry = ToolRegistry.getInstance();
  for (const raw of data) {
    try {
      const drawing = registry.createDrawing(raw.type, raw.id, raw.anchors, raw.style, raw.options);
      if (drawing) manager.addDrawing(drawing);
    } catch {
      // Skip this one entry; the rest of the saved set is still restored.
    }
  }
}

export function persistDrawings(manager: DrawingManager, symbol: string) {
  const key = getPersistenceKey(symbol);
  const drawings = manager.exportDrawings();
  // Cap then write the full set — the debounce coalesces rapid anchor-drag
  // events so we don't re-serialize on every pointermove.
  const capped = drawings.slice(-MAX_DRAWINGS);
  localStorage.setItem(key, JSON.stringify(capped));
}

/** Debounced variant used by live editing — coalesces drag updates per pane. */
export function schedulePersistDrawings(manager: DrawingManager, symbol: string) {
  const existing = persistTimers.get(manager);
  if (existing) clearTimeout(existing);
  persistTimers.set(
    manager,
    setTimeout(() => {
      persistTimers.delete(manager);
      persistDrawings(manager, symbol);
    }, PERSIST_DEBOUNCE_MS)
  );
}
