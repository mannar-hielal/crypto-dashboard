import { DrawingManager, ToolRegistry } from 'lightweight-charts-drawing';
import type { SerializedDrawing } from 'lightweight-charts-drawing';

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

  try {
    const data = JSON.parse(saved) as SerializedDrawing[];
    if (!Array.isArray(data) || data.length === 0) return;

    const registry = ToolRegistry.getInstance();
    const factory = (type: string, raw: SerializedDrawing) => {
      return registry.createDrawing(type, raw.id, raw.anchors, raw.style, raw.options);
    };
    manager.importDrawings(data, factory);
  } catch {
    localStorage.removeItem(key);
  }
}

export function persistDrawings(manager: DrawingManager, symbol: string) {
  const key = getPersistenceKey(symbol);
  const drawings = manager.exportDrawings();
  localStorage.setItem(key, JSON.stringify(drawings));
}
