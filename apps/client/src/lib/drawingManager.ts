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

// ─── One drawing set per symbol, shared by every pane showing it ─────────────
// 🔐 Two panes on one symbol used to keep two copies: each saved its own set under the same
//    key, so a save from pane B erased pane A's newer drawings. Now every pane's manager is
//    registered with its symbol; an edit is saved (debounced) and copied into the other panes on
//    that symbol, and a pane that opens a symbol another pane shows takes that pane's set.

const paneSymbols = new Map<DrawingManager, string>();
// Set while we load or copy drawings into a manager: its `change` is ours, not the user's
let syncing = false;

function peersOf(manager: DrawingManager, symbol: string): DrawingManager[] {
  const peers: DrawingManager[] = [];
  for (const [m, sym] of paneSymbols) if (m !== manager && sym === symbol) peers.push(m);
  return peers;
}

function replaceQuietly(manager: DrawingManager, drawings: readonly Drawing[]): void {
  syncing = true;
  try {
    manager.importJSON(drawings);
  } finally {
    syncing = false;
  }
}

/** Save the manager's set under its symbol and copy it into the other panes on that symbol */
function saveAndShare(manager: DrawingManager): void {
  const symbol = paneSymbols.get(manager);
  if (symbol === undefined) return;
  persistDrawings(manager, symbol);
  const list = manager.drawings();
  for (const peer of peersOf(manager, symbol)) replaceQuietly(peer, list);
}

/** A pending debounced save of this manager, done now */
function flushPending(manager: DrawingManager): void {
  const timer = persistTimers.get(manager);
  if (timer === undefined) return;
  clearTimeout(timer);
  persistTimers.delete(manager);
  saveAndShare(manager);
}

/** The symbol's set into the manager: from a pane already showing it, else from storage */
function loadInto(manager: DrawingManager, symbol: string, scale?: LegacyChartScale): void {
  const peer = peersOf(manager, symbol)[0];
  if (peer) flushPending(peer);
  replaceQuietly(manager, peer ? peer.drawings() : loadDrawings(symbol, scale));
}

/** Debounced save + share after an edit — coalesces drag updates per pane. */
function scheduleSave(manager: DrawingManager): void {
  if (syncing) return;
  const existing = persistTimers.get(manager);
  if (existing) clearTimeout(existing);
  persistTimers.set(
    manager,
    setTimeout(() => {
      persistTimers.delete(manager);
      saveAndShare(manager);
    }, PERSIST_DEBOUNCE_MS)
  );
}

/**
 * A pane's manager joins the symbol's shared set: loads it, then saves and shares every edit.
 * Returns the detach (saves a pending edit first).
 */
export function attachDrawings(
  manager: DrawingManager,
  symbol: string,
  scale?: LegacyChartScale
): () => void {
  paneSymbols.set(manager, symbol);
  loadInto(manager, symbol, scale);
  const off = manager.on('change', () => scheduleSave(manager));
  return () => {
    flushPending(manager);
    off();
    paneSymbols.delete(manager);
  };
}

/** The pane switched symbol: save its set under the old one, then load the new one's */
export function switchDrawingsSymbol(
  manager: DrawingManager,
  symbol: string,
  scale?: LegacyChartScale
): void {
  const previous = paneSymbols.get(manager);
  if (previous === undefined || previous === symbol) return;
  flushPending(manager);
  persistDrawings(manager, previous);
  paneSymbols.set(manager, symbol);
  loadInto(manager, symbol, scale);
}
