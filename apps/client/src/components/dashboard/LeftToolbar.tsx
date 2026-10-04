import { useState, useRef } from 'react';
import type { ElementType, ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  MousePointer2,
  TrendingUp,
  GitBranch,
  Shapes,
  Type,
  Ruler,
  Trash2,
  Pencil,
  Lock,
  Magnet,
  Eye,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { bg } from '@/lib/tokens';
import { useDataTooltip } from '@/hooks/useDataTooltip';
import { CURSOR_VARIANTS, type CursorVariantId } from '@/lib/cursors';
import { TOOL_GROUPS, findGroupByToolType, loadSubTools, saveSubTools } from '@/lib/libraryTools';
import { TOOL_ICONS } from '@/lib/toolIcons';
import { guide } from '@/lib/guideAnchors';
import { formatModShortcut, formatToolShortcut, isMacPlatform } from '@/lib/drawingShortcuts';
import type { MagnetSetting } from '@/lib/drawingTools';
import { DrawingMenu, type MenuEntry } from '@/components/drawing/DrawingMenu';
import { DrawingConfirmDialog } from '@/components/drawing/DrawingConfirmDialog';

// TradingView-quick: the toolbar's tooltips show after 400 ms
const TOOLBAR_TOOLTIP_DELAY_MS = 400;

const GROUP_ICONS: Record<string, ElementType> = {
  'trend-lines': TrendingUp,
  'fib-gann': GitBranch,
  measure: Ruler,
  shapes: Shapes,
  annotations: Type,
};

const MAGNET_LABELS = { weak: 'Weak magnet', strong: 'Strong magnet' } as const;

/** What the menu that's open belongs to */
type OpenMenu =
  | { kind: 'cursor' }
  | { kind: 'group'; groupId: string }
  | { kind: 'magnet' }
  | { kind: 'bin'; total: number; hidden: number };

/** "1 drawing" / "5 drawings" */
function drawingsLabel(n: number): string {
  return `${n} drawing${n === 1 ? '' : 's'}`;
}

// ─── A toolbar button with an optional caret strip (its menu) ───────────────

interface ToolbarSlotProps {
  label: string;
  tooltip: string;
  active: boolean;
  /** A switch (magnet, stay in drawing mode) reports its state as aria-pressed */
  pressed?: boolean;
  /** Gets the slot (button + caret), where a menu opens from */
  onClick: (slot: HTMLElement) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
  children: ReactNode;
  /** The caret's accessible name; no caret without it */
  caretLabel?: string;
  menuOpen?: boolean;
  onOpenMenu?: (anchor: HTMLElement) => void;
  attrs?: Record<string, string>;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

/** The caret is the button's sibling, not its child: a button inside a button is invalid and
 *  unreachable by keyboard (axe nested-interactive, visual gate 2026-09-29) */
function ToolbarSlot({
  label,
  tooltip,
  active,
  pressed,
  onClick,
  onContextMenu,
  children,
  caretLabel,
  menuOpen = false,
  onOpenMenu,
  attrs,
  buttonRef,
}: ToolbarSlotProps) {
  return (
    <div className="toolbar-slot">
      <motion.button
        ref={buttonRef}
        type="button"
        {...attrs}
        data-tooltip={tooltip}
        aria-label={label}
        aria-pressed={pressed}
        onClick={(e) => onClick(e.currentTarget.parentElement ?? e.currentTarget)}
        onContextMenu={onContextMenu}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className={`toolbar-btn focus-ring${active ? ' active' : ''}`}
      >
        <span className="relative z-10 flex items-center justify-center">{children}</span>
      </motion.button>
      {caretLabel && onOpenMenu && (
        <button
          type="button"
          className="toolbar-caret focus-ring"
          aria-label={caretLabel}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => onOpenMenu(e.currentTarget.parentElement ?? e.currentTarget)}
        >
          <span className="toolbar-caret-arrow" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LeftToolbarProps {
  onToolChange?: (toolType: string | null) => void;
  onZoomOut?: () => void;
  cursorVariant?: CursorVariantId;
  onCursorVariantChange?: (variant: CursorVariantId) => void;
  activeToolType?: string | null;
  /** The tool each group button arms (the last one used in the group) */
  subTools?: Record<string, string>;
  /** TradingView's "Stay in drawing mode": a placed drawing leaves its tool armed */
  stayInDrawingMode?: boolean;
  onStayInDrawingModeChange?: (on: boolean) => void;
  magnet?: MagnetSetting;
  onMagnetChange?: (magnet: MagnetSetting) => void;
  /** The active pane's drawings (all, and hidden), read when the Remove menu opens */
  getDrawingCounts?: () => { total: number; hidden: number };
  /** Remove the active pane's drawings (after the confirm) */
  onRemoveDrawings?: () => void;
  onShowHiddenDrawings?: () => void;
}

export function LeftToolbar({
  onToolChange,
  onZoomOut,
  cursorVariant: cursorVariantProp,
  onCursorVariantChange,
  activeToolType: activeToolTypeProp,
  subTools: subToolsProp,
  stayInDrawingMode = false,
  onStayInDrawingModeChange,
  magnet = { on: false, mode: 'weak' },
  onMagnetChange,
  getDrawingCounts,
  onRemoveDrawings,
  onShowHiddenDrawings,
}: LeftToolbarProps) {
  // ── Cursor (local state falls back when uncontrolled) ──────────────────
  const [localCursorVariant, setLocalCursorVariant] = useState<CursorVariantId>('cross');
  const cursorVariant = cursorVariantProp ?? localCursorVariant;

  // ── Tool state (external prop takes precedence, fall back to local) ──────
  const [localToolType, setLocalToolType] = useState<string | null>(null);
  const activeToolType = activeToolTypeProp !== undefined ? activeToolTypeProp : localToolType;

  // The last tool used in each group, remembered across reloads (TradingView); the dashboard
  // owns it (a shortcut changes it too), local state when uncontrolled
  const [localSubTools, setLocalSubTools] = useState<Record<string, string>>(loadSubTools);
  const subToolMap = subToolsProp ?? localSubTools;

  const [menu, setMenu] = useState<{ open: OpenMenu; left: number; top: number } | null>(null);
  const menuOpenerRef = useRef<HTMLElement | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const asideRef = useRef<HTMLElement>(null);
  const tooltip = useDataTooltip(asideRef, 'right', TOOLBAR_TOOLTIP_DELAY_MS);
  const [mac] = useState(isMacPlatform);

  // ── Handlers ────────────────────────────────────────────────────────────

  function arm(toolType: string | null) {
    setLocalToolType(toolType);
    onToolChange?.(toolType);
  }

  function openMenu(open: OpenMenu, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    menuOpenerRef.current = anchor.querySelector('button') ?? anchor;
    setMenu({ open, left: rect.right + 6, top: rect.top });
  }

  function toggleMenu(open: OpenMenu, anchor: HTMLElement) {
    if (menu && menu.open.kind === open.kind) {
      const same =
        open.kind !== 'group' || (menu.open.kind === 'group' && menu.open.groupId === open.groupId);
      if (same) {
        setMenu(null);
        return;
      }
    }
    openMenu(open, anchor);
  }

  function openBinMenu(anchor: HTMLElement) {
    const counts = getDrawingCounts?.() ?? { total: 0, hidden: 0 };
    toggleMenu({ kind: 'bin', ...counts }, anchor);
  }

  function handleMenuSelect(id: string) {
    const open = menu?.open;
    setMenu(null);
    if (!open) return;
    if (open.kind === 'cursor') {
      // TradingView's Eraser sits in the cursor menu: it is the Eraser tool, not a pointer style
      if (id === 'eraser') {
        arm('eraser');
        return;
      }
      setLocalCursorVariant(id as CursorVariantId);
      onCursorVariantChange?.(id as CursorVariantId);
      arm(null);
    } else if (open.kind === 'group') {
      const next = { ...subToolMap, [open.groupId]: id };
      setLocalSubTools(next);
      saveSubTools(next);
      arm(id);
    } else if (open.kind === 'magnet') {
      onMagnetChange?.({ on: true, mode: id as MagnetSetting['mode'] });
    } else if (id === 'remove-drawings') {
      setConfirmRemove(open.total);
    } else if (id === 'show-hidden') {
      onShowHiddenDrawings?.();
    } else if (id === 'eraser') {
      arm(activeToolType === 'eraser' ? null : 'eraser');
    }
  }

  function menuEntries(open: OpenMenu): { label: string; entries: MenuEntry[] } {
    if (open.kind === 'cursor') {
      return {
        label: 'Cursors',
        entries: CURSOR_VARIANTS.map((v, i): MenuEntry => {
          if (v === null) return { type: 'separator', id: `sep-${i}` };
          const VariantIcon = v.icon;
          return {
            type: 'item',
            id: v.id,
            label: v.label,
            icon: <VariantIcon size={18} />,
            checked:
              v.id === 'eraser'
                ? activeToolType === 'eraser'
                : activeToolType === null && cursorVariant === v.id,
          };
        }),
      };
    }
    if (open.kind === 'magnet') {
      return {
        label: 'Magnet',
        entries: (['weak', 'strong'] as const).map((mode) => ({
          type: 'item',
          id: mode,
          label: MAGNET_LABELS[mode],
          icon: <Magnet size={16} strokeWidth={1.5} />,
          checked: magnet.on && magnet.mode === mode,
        })),
      };
    }
    if (open.kind === 'bin') {
      const EraserIcon = TOOL_ICONS.eraser;
      const entries: MenuEntry[] = [
        {
          type: 'item',
          id: 'remove-drawings',
          label: `Remove ${drawingsLabel(open.total)}`,
          icon: <Trash2 size={16} strokeWidth={1.5} />,
          disabled: open.total === 0,
          danger: true,
          attrs: guide('toolbar.subtool', 'remove-drawings') as Record<string, string>,
        },
      ];
      if (open.hidden > 0) {
        entries.push({
          type: 'item',
          id: 'show-hidden',
          label: `Show ${drawingsLabel(open.hidden)} hidden`,
          icon: <Eye size={16} strokeWidth={1.5} />,
        });
      }
      entries.push(
        { type: 'separator', id: 'sep' },
        {
          type: 'item',
          id: 'eraser',
          label: 'Eraser',
          icon: EraserIcon ? <EraserIcon size={16} /> : undefined,
          checked: activeToolType === 'eraser',
          attrs: guide('toolbar.subtool', 'eraser') as Record<string, string>,
        }
      );
      return { label: 'Remove', entries };
    }
    const group = TOOL_GROUPS.find((g) => g.id === open.groupId);
    const entries: MenuEntry[] = [];
    for (const cat of group?.categories ?? []) {
      entries.push({ type: 'header', id: `cat-${cat.label}`, label: cat.label });
      for (const t of cat.tools) {
        const ToolIcon = TOOL_ICONS[t.id];
        entries.push({
          type: 'item',
          id: t.id,
          label: t.label,
          icon: ToolIcon ? <ToolIcon size={16} /> : undefined,
          shortcut: formatToolShortcut(t.id, mac),
          checked: activeToolType === t.id,
          attrs: guide('toolbar.subtool', t.id) as Record<string, string>,
        });
      }
    }
    return { label: `${group?.label ?? ''} tools`, entries };
  }

  const cursorDef = CURSOR_VARIANTS.find(
    (v): v is NonNullable<typeof v> => v !== null && v.id === cursorVariant
  );
  const CursorIcon = cursorDef?.icon;
  const zoomActive = activeToolType === 'zoom-in';
  const magnetTooltip = magnet.on ? `Magnet: ${MAGNET_LABELS[magnet.mode]}` : 'Magnet';
  const openMenuContent = menu ? menuEntries(menu.open) : null;

  return (
    <aside
      ref={asideRef}
      className="flex w-13 shrink-0 flex-col items-center gap-1 border-r border-white/6 py-2 overflow-y-auto overflow-x-hidden"
      style={{ background: bg.page }}
    >
      {/* ── Cursor ─────────────────────────────────────────────────────── */}
      <ToolbarSlot
        label={cursorDef?.label ?? 'Cursor'}
        tooltip={cursorDef?.label ?? 'Cursor'}
        active={activeToolType === null}
        onClick={() => arm(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          toggleMenu({ kind: 'cursor' }, e.currentTarget.parentElement ?? e.currentTarget);
        }}
        caretLabel="Change cursor style"
        menuOpen={menu?.open.kind === 'cursor'}
        onOpenMenu={(anchor) => toggleMenu({ kind: 'cursor' }, anchor)}
        attrs={guide('toolbar.tool', 'cursor') as Record<string, string>}
      >
        {CursorIcon ? <CursorIcon size={22} /> : <MousePointer2 size={22} strokeWidth={1} />}
      </ToolbarSlot>

      <div className="toolbar-divider" />

      {/* ── Drawing tool groups (TradingView's order) ──────────────────── */}
      {TOOL_GROUPS.map((group) => {
        const toolId = subToolMap[group.id];
        const toolDef = group.categories.flatMap((c) => c.tools).find((t) => t.id === toolId);
        const ToolIcon = toolDef ? TOOL_ICONS[toolDef.id] : undefined;
        const GroupIcon = GROUP_ICONS[group.id] ?? Shapes;
        const label = toolDef?.label ?? group.label;
        const shortcut = toolDef ? formatToolShortcut(toolDef.id, mac) : undefined;
        const active =
          activeToolType !== null && findGroupByToolType(activeToolType)?.id === group.id;
        return (
          <ToolbarSlot
            key={group.id}
            label={label}
            tooltip={shortcut ? `${label} · ${shortcut}` : label}
            active={active}
            onClick={() => {
              if (toolId) arm(toolId);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              toggleMenu(
                { kind: 'group', groupId: group.id },
                e.currentTarget.parentElement ?? e.currentTarget
              );
            }}
            caretLabel={`${group.label} tools`}
            menuOpen={menu?.open.kind === 'group' && menu.open.groupId === group.id}
            onOpenMenu={(anchor) => toggleMenu({ kind: 'group', groupId: group.id }, anchor)}
            attrs={guide('toolbar.tool', group.id) as Record<string, string>}
          >
            {ToolIcon ? <ToolIcon size={22} /> : <GroupIcon size={22} strokeWidth={1} />}
          </ToolbarSlot>
        );
      })}

      <div className="toolbar-divider" />

      {/* ── Magnet, Stay in drawing mode, Remove: switches, not tools ──── */}
      <ToolbarSlot
        label="Magnet"
        tooltip={magnetTooltip}
        active={magnet.on}
        pressed={magnet.on}
        onClick={() => onMagnetChange?.({ ...magnet, on: !magnet.on })}
        caretLabel="Magnet strength"
        menuOpen={menu?.open.kind === 'magnet'}
        onOpenMenu={(anchor) => toggleMenu({ kind: 'magnet' }, anchor)}
        attrs={guide('toolbar.tool', 'magnet') as Record<string, string>}
      >
        <Magnet size={22} strokeWidth={1} />
      </ToolbarSlot>

      <ToolbarSlot
        label="Stay in drawing mode"
        tooltip={stayInDrawingMode ? 'Stay in drawing mode: on' : 'Stay in drawing mode'}
        active={stayInDrawingMode}
        pressed={stayInDrawingMode}
        onClick={() => onStayInDrawingModeChange?.(!stayInDrawingMode)}
        attrs={guide('toolbar.tool', 'stay-mode') as Record<string, string>}
      >
        <Pencil size={20} strokeWidth={1} />
        <Lock className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5" strokeWidth={1.5} />
      </ToolbarSlot>

      <ToolbarSlot
        label="Remove drawings"
        tooltip="Remove drawings"
        active={activeToolType === 'eraser'}
        onClick={openBinMenu}
        onContextMenu={(e) => {
          e.preventDefault();
          openBinMenu(e.currentTarget.parentElement ?? e.currentTarget);
        }}
        caretLabel="Remove options"
        menuOpen={menu?.open.kind === 'bin'}
        onOpenMenu={openBinMenu}
        attrs={guide('toolbar.tool', 'bin') as Record<string, string>}
      >
        <Trash2 size={22} strokeWidth={1} />
      </ToolbarSlot>

      <div className="toolbar-divider" />
      <ToolbarSlot
        label="Zoom in"
        tooltip="Zoom in"
        active={zoomActive}
        onClick={() => arm(zoomActive ? null : 'zoom-in')}
      >
        <ZoomIn size={22} strokeWidth={1} />
      </ToolbarSlot>
      <ToolbarSlot label="Zoom out" tooltip="Zoom out" active={false} onClick={() => onZoomOut?.()}>
        <ZoomOut size={22} strokeWidth={1} />
      </ToolbarSlot>

      {menu && openMenuContent && (
        <DrawingMenu
          label={openMenuContent.label}
          entries={openMenuContent.entries}
          position={{ left: menu.left, top: menu.top }}
          onSelect={handleMenuSelect}
          onClose={() => setMenu(null)}
          returnFocus={() => menuOpenerRef.current?.focus()}
        />
      )}

      {confirmRemove !== null && (
        <DrawingConfirmDialog
          title={`Remove ${drawingsLabel(confirmRemove)}?`}
          message={`Only the active chart's drawings are removed. You can undo with ${formatModShortcut('Z', mac)}.`}
          confirmLabel="Remove"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            setConfirmRemove(null);
            onRemoveDrawings?.();
          }}
        />
      )}

      {tooltip}
    </aside>
  );
}
