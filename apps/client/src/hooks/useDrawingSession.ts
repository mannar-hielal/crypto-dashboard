/**
 * The dashboard's drawing tools across its panes: the armed tool, each pane's DrawingManager and
 * undo history, the toolbar switches (stay in drawing mode, magnet) and TradingView's shortcuts.
 * Toolbar actions and shortcuts act on the active pane (the one last clicked).
 */

import { useEffect, useRef, useState } from 'react';
import type { DrawingKind, DrawingManager } from 'lightweight-charts-drawing';
import { useLayoutStore } from '@/store/layoutStore';
import { TOOL_MAP, dropPreLibraryDrawings, isSyncingDrawings } from '@/lib/drawingManager';
import {
  HOST_TOOLS,
  applyMagnet,
  applyStayInDrawingMode,
  connectPaneManager,
  loadMagnet,
  loadStayInDrawingMode,
  magnetModeOf,
  nextActiveTool,
  type MagnetSetting,
} from '@/lib/drawingTools';
import { createDrawingHistory, type DrawingHistory } from '@/lib/drawingHistory';
import {
  cloneSelection,
  copySelection,
  hasClipboard,
  pasteClipboard,
} from '@/lib/drawingClipboard';
import { isMacPlatform, matchDrawingShortcut } from '@/lib/drawingShortcuts';
import { findGroupByToolType, loadSubTools, saveSubTools } from '@/lib/libraryTools';

const PANES = 4;

/** Text highlighted on the page (a selection that isn't collapsed) */
function hasPageTextSelection(): boolean {
  return (window.getSelection()?.toString() ?? '') !== '';
}

/** Arm `toolType` in one pane's manager (null disarms); the host's own tools never reach it */
function armInPane(manager: DrawingManager | null | undefined, toolType: string | null): void {
  if (!manager || (toolType !== null && HOST_TOOLS.has(toolType))) return;
  manager.setTool(toolType === null ? null : ((TOOL_MAP[toolType] ?? toolType) as DrawingKind));
}

export interface DrawingSession {
  activeToolType: string | null;
  /** The tool each toolbar group arms: the last one used in it (menu or shortcut), remembered */
  subTools: Record<string, string>;
  /** The toolbar or a shortcut picked a tool (null = the cursor) */
  selectTool: (toolType: string | null) => void;
  /** ChartPanel's manager is ready; returns the cleanup for when its chart goes */
  onManagerReady: (paneIndex: number, manager: DrawingManager) => () => void;
  /** The pane's manager, or null before its chart is up */
  managerOf: (paneIndex: number) => DrawingManager | null;
  stayInDrawingMode: boolean;
  setStayInDrawingMode: (on: boolean) => void;
  magnet: MagnetSetting;
  setMagnet: (magnet: MagnetSetting) => void;
  /** The active pane's drawings: all and hidden */
  drawingCounts: () => { total: number; hidden: number };
  removeDrawings: () => void;
  showHiddenDrawings: () => void;
  undo: () => boolean;
  redo: () => boolean;
  clone: (paneIndex: number) => void;
  copy: (paneIndex: number) => void;
}

export function useDrawingSession(): DrawingSession {
  const [activeToolType, setActiveToolType] = useState<string | null>(null);
  const [subTools, setSubTools] = useState(loadSubTools);
  const managers = useRef<(DrawingManager | null)[]>(Array(PANES).fill(null));
  const histories = useRef<(DrawingHistory | null)[]>(Array(PANES).fill(null));
  const [stayInDrawingMode, setStay] = useState(loadStayInDrawingMode);
  const [magnet, setMagnetState] = useState(loadMagnet);
  // A pane mounted later reads the switches here, not from a stale closure
  const prefs = useRef({ stayInDrawingMode, magnet });

  const activeManager = () => managers.current[useLayoutStore.getState().activePane] ?? null;
  const activeHistory = () => histories.current[useLayoutStore.getState().activePane] ?? null;

  function selectTool(toolType: string | null) {
    setActiveToolType(toolType);
    if (toolType !== null) rememberSubTool(toolType);
    armInPane(activeManager(), toolType);
  }

  /** A group's tool, armed from its menu or a shortcut, becomes the tool its button arms */
  function rememberSubTool(toolType: string) {
    const group = findGroupByToolType(toolType);
    if (!group) return;
    setSubTools((prev) => (prev[group.id] === toolType ? prev : { ...prev, [group.id]: toolType }));
  }

  // Saved when it changes (the state's updater stays pure)
  useEffect(() => saveSubTools(subTools), [subTools]);

  /** The library disarms its tool after a placement (TradingView: back to the cursor) or on
   *  Escape — never ending the Eraser or zoom-in; Delete acts on the pane last clicked only. */
  function onManagerReady(paneIndex: number, manager: DrawingManager) {
    const release = connectPaneManager(
      managers.current,
      paneIndex,
      manager,
      (kind) => setActiveToolType((prev) => nextActiveTool(prev, kind)),
      {
        stayInDrawingMode: prefs.current.stayInDrawingMode,
        magnet: magnetModeOf(prefs.current.magnet),
      }
    );
    const history = createDrawingHistory(manager, isSyncingDrawings);
    histories.current[paneIndex] = history;
    return () => {
      release();
      history.destroy();
      if (histories.current[paneIndex] === history) histories.current[paneIndex] = null;
    };
  }

  function setStayInDrawingMode(on: boolean) {
    prefs.current = { ...prefs.current, stayInDrawingMode: on };
    setStay(on);
    applyStayInDrawingMode(managers.current, on);
  }

  function setMagnet(next: MagnetSetting) {
    prefs.current = { ...prefs.current, magnet: next };
    setMagnetState(next);
    applyMagnet(managers.current, next);
  }

  function drawingCounts() {
    const list = activeManager()?.drawings() ?? [];
    return { total: list.length, hidden: list.filter((d) => d.hidden).length };
  }

  function removeDrawings() {
    activeManager()?.clear();
  }

  function showHiddenDrawings() {
    const m = activeManager();
    if (!m) return;
    for (const d of m.drawings()) if (d.hidden) m.update({ ...d, hidden: false });
  }

  function paneHistory(paneIndex?: number) {
    return paneIndex === undefined ? activeHistory() : histories.current[paneIndex];
  }

  // The pre-July drawing store has nothing left to load (drawingManager)
  useEffect(dropPreLibraryDrawings, []);

  // ── TradingView shortcuts (window-wide; ignored while typing in a field) ──
  useEffect(() => {
    const mac = isMacPlatform();
    const onKeyDown = (e: KeyboardEvent) => {
      const hit = matchDrawingShortcut(e, mac);
      if (!hit) return;
      const manager = managers.current[useLayoutStore.getState().activePane];
      const history = histories.current[useLayoutStore.getState().activePane];
      if (hit.type === 'tool') {
        setActiveToolType(hit.tool);
        rememberSubTool(hit.tool);
        armInPane(manager, hit.tool);
      } else if (hit.type === 'undo') {
        if (!history?.undo()) return;
      } else if (hit.type === 'redo') {
        if (!history?.redo()) return;
      } else if (hit.type === 'copy') {
        // Highlighted page text (a table, the order panel) is the user's copy, not the drawing's;
        // with no drawing selected either, the browser copies as usual
        if (hasPageTextSelection() || !manager || copySelection(manager) === 0) return;
      } else if (hit.type === 'paste') {
        if (!manager || !hasClipboard()) return;
        pasteClipboard(manager);
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    activeToolType,
    subTools,
    selectTool,
    onManagerReady,
    managerOf: (paneIndex) => managers.current[paneIndex] ?? null,
    stayInDrawingMode,
    setStayInDrawingMode,
    magnet,
    setMagnet,
    drawingCounts,
    removeDrawings,
    showHiddenDrawings,
    undo: () => paneHistory()?.undo() ?? false,
    redo: () => paneHistory()?.redo() ?? false,
    clone: (paneIndex) => {
      const m = managers.current[paneIndex];
      if (m) cloneSelection(m);
    },
    copy: (paneIndex) => {
      const m = managers.current[paneIndex];
      if (m) copySelection(m);
    },
  };
}
