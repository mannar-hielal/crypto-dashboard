import { parseDrawings } from 'lightweight-charts-drawing';
import type { DrawingManager, Drawing } from 'lightweight-charts-drawing';
import { convertLegacyDrawings, type LegacyChartScale } from '@/lib/drawingMigration';

// 🔐 Hard cap on persisted drawings per symbol — prevents unbounded localStorage
//    growth from an untracked drawing spree (and keeps the restore cost bounded).
export const MAX_DRAWINGS = 200;

// Short debounce so drag updates (`change` fires per pointermove) don't
// re-serialize the full drawing set on every move.
const PERSIST_DEBOUNCE_MS = 150;
// 🔐 Keyed by DrawingManager instance, not by symbol string. Two panes can
// show the same symbol at once, each with its own DrawingManager — keying by
// symbol alone made them share one timer, so editing pane B would
// clearTimeout() and silently drop pane A's still-pending save. Keying by
// instance makes every pane's debounce independent regardless of what symbol
// any of them are currently showing.
const persistTimers = new WeakMap<DrawingManager, ReturnType<typeof setTimeout>>();

/** Toolbar ids from before the library menu → library kinds (TradingView names) */
export const TOOL_MAP: Record<string, string> = {
  trendline: 'trend-line',
  horizontal: 'horizontal-line',
  vertical: 'vertical-line',
  ray: 'ray',
  parallel: 'parallel-channel',
  polyline: 'polyline',
  text: 'text',
  note: 'note',
  callout: 'callout',
  priceNote: 'price-note',
  priceLabel: 'price-label',
};

/** The drawings of a symbol (library 0.4 model) */
export function getPersistenceKey(symbol: string): string {
  return `cd-drawings-v2-${symbol}`;
}

/** Library 0.1's drawings of a symbol — read once to migrate, then left for a rollback */
export function getLegacyPersistenceKey(symbol: string): string {
  return `cd-drawings-${symbol}`;
}

// 🔐 localStorage can throw (blocked storage, private mode) — treat it as optional
function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Full or blocked storage: the drawings stay on the chart for this session
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * The saved drawings of a symbol, schema-checked (🔐 localStorage is untrusted input: anything
 * malformed is dropped, never thrown). The first load after the library upgrade converts the 0.1
 * entries and saves them under the new key, so the conversion runs once.
 */
export function loadDrawings(symbol: string, scale?: LegacyChartScale): Drawing[] {
  const saved = readKey(getPersistenceKey(symbol));
  if (saved !== null) return parseDrawings(parseJson(saved)).slice(-MAX_DRAWINGS);

  const legacy = readKey(getLegacyPersistenceKey(symbol));
  if (legacy === null) return [];
  const converted = convertLegacyDrawings(parseJson(legacy), scale).slice(-MAX_DRAWINGS);
  writeKey(getPersistenceKey(symbol), JSON.stringify(converted));
  return converted;
}

/** Replace the manager's drawings with the symbol's saved set (empty when none) */
export function restoreDrawings(
  manager: DrawingManager,
  symbol: string,
  scale?: LegacyChartScale
): void {
  manager.importJSON(loadDrawings(symbol, scale));
}

export function persistDrawings(manager: DrawingManager, symbol: string): void {
  const capped = manager.drawings().slice(-MAX_DRAWINGS);
  writeKey(getPersistenceKey(symbol), JSON.stringify(capped));
}

/** Debounced variant used by live editing — coalesces drag updates per pane. */
export function schedulePersistDrawings(manager: DrawingManager, symbol: string): void {
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
