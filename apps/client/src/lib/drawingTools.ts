/**
 * Toolbar tools around the drawing library: the ones the library doesn't know (Eraser, zoom-in)
 * and how they share the active-tool state with it. Used by DashboardPage and ChartPanel.
 */

import type { DrawingManager, MagnetMode } from 'lightweight-charts-drawing';

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
 * `onTool`, its selection clears the other panes' (keepSelectionInOnePane), and it takes the
 * current "Stay in drawing mode" and magnet settings. Returns the
 * cleanup for when the pane's chart goes: listeners off, and the slot emptied if it still holds
 * this manager (a remount may already have put the next one there).
 */
export function connectPaneManager(
  panes: (DrawingManager | null)[],
  paneIndex: number,
  manager: DrawingManager,
  onTool: (kind: string | null) => void,
  prefs: { stayInDrawingMode?: boolean; magnet?: MagnetMode } = {}
): () => void {
  panes[paneIndex] = manager;
  manager.setStayInDrawingMode(prefs.stayInDrawingMode ?? false);
  manager.setMagnet(prefs.magnet ?? 'off');
  const offTool = manager.on('tool', onTool);
  const offSelection = keepSelectionInOnePane(manager, () => panes);
  return () => {
    offTool();
    offSelection();
    if (panes[paneIndex] === manager) panes[paneIndex] = null;
  };
}

// ─── Stay in drawing mode ───────────────────────────────────────────────────

const STAY_IN_DRAWING_MODE_KEY = 'cd-drawing-stay-mode';

/** The saved "Stay in drawing mode" switch (TradingView remembers it); off when unset or unreadable */
export function loadStayInDrawingMode(): boolean {
  // 🔐 localStorage can throw (blocked storage, private mode) — treat it as optional
  try {
    return localStorage.getItem(STAY_IN_DRAWING_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * "Stay in drawing mode" (TradingView's toolbar lock): on, a placed drawing leaves its tool armed
 * for the next one, unselected; off, the tool returns to the cursor with the drawing selected.
 * Applies to every pane's manager and saves the switch.
 */
export function applyStayInDrawingMode(
  panes: readonly (DrawingManager | null)[],
  on: boolean
): void {
  for (const m of panes) m?.setStayInDrawingMode(on);
  try {
    localStorage.setItem(STAY_IN_DRAWING_MODE_KEY, on ? '1' : '0');
  } catch {
    // Full or blocked storage: the switch holds for this session
  }
}

// ─── Magnet ─────────────────────────────────────────────────────────────────

const MAGNET_KEY = 'cd-drawing-magnet';

/** The toolbar magnet (TradingView): on or off, and the strength it snaps with when on */
export interface MagnetSetting {
  on: boolean;
  mode: 'weak' | 'strong';
}

export const MAGNET_DEFAULT: MagnetSetting = { on: false, mode: 'weak' };

/** The library's magnet mode for a setting */
export function magnetModeOf(setting: MagnetSetting): MagnetMode {
  return setting.on ? setting.mode : 'off';
}

/** The saved magnet; the default (off, weak) when unset, unreadable or malformed */
export function loadMagnet(): MagnetSetting {
  try {
    // 🔐 localStorage is untrusted input: only the two known fields, only known values
    const raw = JSON.parse(localStorage.getItem(MAGNET_KEY) ?? 'null') as unknown;
    if (raw && typeof raw === 'object') {
      const { on, mode } = raw as Record<string, unknown>;
      if (typeof on === 'boolean' && (mode === 'weak' || mode === 'strong')) return { on, mode };
    }
  } catch {
    // Blocked storage or bad JSON: the default
  }
  return MAGNET_DEFAULT;
}

/** The magnet onto every pane's manager, and saved */
export function applyMagnet(
  panes: readonly (DrawingManager | null)[],
  setting: MagnetSetting
): void {
  for (const m of panes) m?.setMagnet(magnetModeOf(setting));
  try {
    localStorage.setItem(MAGNET_KEY, JSON.stringify(setting));
  } catch {
    // Full or blocked storage: the setting holds for this session
  }
}
