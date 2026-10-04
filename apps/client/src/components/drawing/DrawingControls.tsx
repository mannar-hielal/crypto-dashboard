/**
 * A pane's drawing controls over its chart (TradingView): the floating toolbar while drawings are
 * selected, the right-click menu on a drawing, and the settings dialog. A right-click anywhere
 * else returns to the cursor (it cancels a drawing tool), as before.
 */

import { useEffect, useState, type RefObject } from 'react';
import {
  Settings,
  CopyPlus,
  Copy,
  ArrowUpToLine,
  ArrowDownToLine,
  Lock,
  LockOpen,
  EyeOff,
  Trash2,
} from 'lucide-react';
import {
  tableCells,
  type Drawing,
  type DrawingManager,
  type TableCellRef,
} from 'lightweight-charts-drawing';
import { runDrawingAction, styleSelection, type DrawingMenuAction } from '@/lib/drawingActions';
import { formatModShortcut, isMacPlatform } from '@/lib/drawingShortcuts';
import { toolLabel } from '@/lib/libraryTools';
import { guide } from '@/lib/guideAnchors';
import { DrawingFloatingToolbar } from './DrawingFloatingToolbar';
import { DrawingMenu, type MenuEntry } from './DrawingMenu';
import { DrawingSettingsDialog } from './DrawingSettingsDialog';
import { DrawingCellEditor } from './DrawingCellEditor';

interface DrawingControlsProps {
  manager: DrawingManager | null;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Right-click off a drawing: back to the cursor */
  onCursor: () => void;
}

export function DrawingControls({ manager, containerRef, onCursor }: DrawingControlsProps) {
  const [selected, setSelected] = useState<readonly Drawing[]>([]);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null);
  const [settingsFor, setSettingsFor] = useState<Drawing | null>(null);
  const [cellEdit, setCellEdit] = useState<{
    drawing: Drawing;
    cell: TableCellRef;
    box: { left: number; top: number; width: number; height: number };
  } | null>(null);
  const [mac] = useState(isMacPlatform);

  // The selection, kept current through edits
  useEffect(() => {
    if (!manager) return;
    const read = () => setSelected(manager.selection().flatMap((id) => manager.get(id) ?? []));
    read();
    const offSelection = manager.on('selection', read);
    const offChange = manager.on('change', read);
    return () => {
      offSelection();
      offChange();
    };
  }, [manager]);

  // A click on a cell of a selected Table: our editor opens over it (TradingView)
  useEffect(() => {
    if (!manager) return;
    return manager.on('tableEdit', (drawing, cell, box) => setCellEdit({ drawing, cell, box }));
  }, [manager]);

  // The pane's size, to keep the toolbar inside it — watched only while the toolbar shows
  const hasSelection = selected.length > 0;
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasSelection) return;
    const measure = () => setBounds({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, hasSelection]);

  // Right-click: the drawing under the pointer gets the menu; anywhere else, back to the cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      // Mid-drag (the left button still down): no menu, no tool change; the drag carries on
      if (manager?.busy()) return;
      const id = manager?.hoveredId();
      if (!manager || !id || manager.tool() !== null) {
        setMenuAt(null);
        onCursor();
        return;
      }
      if (!manager.selection().includes(id)) manager.select([id]);
      setMenuAt({ left: e.clientX, top: e.clientY });
    };
    el.addEventListener('contextmenu', onContextMenu);
    return () => el.removeEventListener('contextmenu', onContextMenu);
  }, [containerRef, manager, onCursor]);

  if (!manager) return null;

  function act(action: DrawingMenuAction) {
    if (!manager) return;
    if (action === 'settings') {
      const first = manager.selection()[0];
      setSettingsFor(first ? (manager.get(first) ?? null) : null);
      return;
    }
    runDrawingAction(manager, action);
  }

  const locked = selected.length > 0 && selected.every((d) => d.locked);
  const menuEntries: MenuEntry[] = [
    { type: 'item', id: 'settings', label: 'Settings…', icon: <Settings size={16} /> },
    {
      type: 'item',
      id: 'clone',
      label: 'Clone',
      icon: <CopyPlus size={16} />,
      shortcut: mac ? '⌘ drag' : 'Ctrl+drag',
    },
    {
      type: 'item',
      id: 'copy',
      label: 'Copy',
      icon: <Copy size={16} />,
      shortcut: formatModShortcut('C', mac),
    },
    { type: 'separator', id: 'sep-1' },
    { type: 'item', id: 'front', label: 'Bring to front', icon: <ArrowUpToLine size={16} /> },
    { type: 'item', id: 'back', label: 'Send to back', icon: <ArrowDownToLine size={16} /> },
    { type: 'separator', id: 'sep-2' },
    {
      type: 'item',
      id: 'lock',
      label: locked ? 'Unlock' : 'Lock',
      icon: locked ? <LockOpen size={16} /> : <Lock size={16} />,
    },
    { type: 'item', id: 'hide', label: 'Hide', icon: <EyeOff size={16} /> },
    {
      type: 'item',
      id: 'remove',
      label: 'Remove',
      icon: <Trash2 size={16} />,
      shortcut: 'Del',
      danger: true,
      attrs: guide('drawing.menu', 'remove') as Record<string, string>,
    },
  ];

  return (
    <>
      {selected.length > 0 && bounds.width > 0 && (
        <DrawingFloatingToolbar
          drawings={selected}
          bounds={bounds}
          onStyle={(patch) => styleSelection(manager, patch)}
          onToggleLock={() => act('lock')}
          onRemove={() => act('remove')}
          onSettings={() => act('settings')}
          onAction={act}
        />
      )}
      {menuAt && (
        <DrawingMenu
          label="Drawing"
          entries={menuEntries}
          position={menuAt}
          onSelect={(id) => {
            setMenuAt(null);
            act(id as DrawingMenuAction);
          }}
          onClose={() => setMenuAt(null)}
        />
      )}
      {cellEdit && (
        <DrawingCellEditor
          key={`${cellEdit.drawing.id}:${cellEdit.cell.join(',')}`}
          box={cellEdit.box}
          initialText={
            tableCells(cellEdit.drawing.style)[cellEdit.cell[0]]?.[cellEdit.cell[1]] ?? ''
          }
          fontSize={cellEdit.drawing.style.fontSize ?? 14}
          onSave={(text) => manager.setTableCellText(cellEdit.drawing.id, cellEdit.cell, text)}
          onClose={() => {
            setCellEdit(null);
            manager.endTableEdit();
          }}
        />
      )}
      {settingsFor && (
        <DrawingSettingsDialog
          key={settingsFor.id}
          drawing={settingsFor}
          title={toolLabel(settingsFor.kind)}
          onApply={(next) => manager.update(next)}
          onClose={() => setSettingsFor(null)}
        />
      )}
    </>
  );
}
