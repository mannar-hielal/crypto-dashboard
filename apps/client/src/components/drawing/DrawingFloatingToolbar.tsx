/**
 * TradingView's floating toolbar for the selected drawing(s): drag handle, line colour, fill,
 * text colour, line width, line style, font size, settings, lock, remove and More. Only the
 * controls the tool supports show (drawingCapabilities). A change applies to every selected
 * drawing; the controls show the first one's values. It sits at the top of the chart; drag it by
 * its handle and it stays where you put it (remembered).
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { useDataTooltip } from '@/hooks/useDataTooltip';
import {
  GripVertical,
  Pencil,
  PaintBucket,
  Type,
  Settings,
  Lock,
  LockOpen,
  Trash2,
  MoreHorizontal,
  ChartLine,
  Copy,
  CopyPlus,
  ArrowUpToLine,
  ArrowDownToLine,
  EyeOff,
} from 'lucide-react';
import type { Drawing, DrawingStyle } from 'lightweight-charts-drawing';

type LineStyle = DrawingStyle['lineStyle'];
import { capabilitiesOf } from '@/lib/drawingCapabilities';
import type { DrawingMenuAction } from '@/lib/drawingActions';
import { formatModShortcut, isMacPlatform } from '@/lib/drawingShortcuts';
import { guide } from '@/lib/guideAnchors';
import { DrawingMenu, type MenuEntry } from './DrawingMenu';
import { DrawingColorPopover } from './DrawingColorPopover';
import styles from './DrawingFloatingToolbar.module.css';

const LINE_WIDTHS = [1, 2, 3, 4] as const;
const LINE_STYLES: readonly { id: LineStyle; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];
const FONT_SIZES = [10, 11, 12, 14, 16, 20, 24, 28, 32, 40] as const;

/** Where the toolbar sits in the pane (px from its top-left), remembered across reloads */
const POSITION_KEY = 'cd-drawing-toolbar-pos';
const EDGE_PX = 8;

type Position = { left: number; top: number };

function loadPosition(): Position | null {
  try {
    // 🔐 localStorage is untrusted input: two finite numbers or nothing
    const raw = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null') as unknown;
    if (raw && typeof raw === 'object') {
      const { left, top } = raw as Record<string, unknown>;
      if (Number.isFinite(left) && Number.isFinite(top))
        return { left: Number(left), top: Number(top) };
    }
  } catch {
    // Blocked storage or bad JSON: the default place
  }
  return null;
}

function savePosition(p: Position): void {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(p));
  } catch {
    // Full or blocked storage: it stays put for this session
  }
}

/** Kept inside the pane */
function clamp(
  p: Position,
  bounds: { width: number; height: number },
  size: { w: number; h: number }
) {
  return {
    left: Math.max(EDGE_PX, Math.min(p.left, bounds.width - size.w - EDGE_PX)),
    top: Math.max(EDGE_PX, Math.min(p.top, bounds.height - size.h - EDGE_PX)),
  };
}

type Popup = {
  kind: 'line' | 'fill' | 'text' | 'width' | 'style' | 'font' | 'more';
  left: number;
  top: number;
} | null;

interface DrawingFloatingToolbarProps {
  /** The selected drawings (the first one's values show) */
  drawings: readonly Drawing[];
  /** The pane's size, to keep the toolbar inside it */
  bounds: { width: number; height: number };
  onStyle: (patch: Partial<DrawingStyle>) => void;
  onToggleLock: () => void;
  onRemove: () => void;
  onSettings: () => void;
  /** More menu: the drawing actions, and "Create limit order…" on a position (the touch path to
   *  it: a phone has no right-click) */
  onAction: (action: DrawingMenuAction) => void;
}

export function DrawingFloatingToolbar({
  drawings,
  bounds,
  onStyle,
  onToggleLock,
  onRemove,
  onSettings,
  onAction,
}: DrawingFloatingToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<Position | null>(loadPosition);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [popup, setPopup] = useState<Popup>(null);
  const [mac] = useState(isMacPlatform);
  const tooltip = useDataTooltip(ref, 'bottom-end', 400);

  const drawing = drawings[0]!;
  const caps = capabilitiesOf(drawing.kind);
  const s = drawing.style;
  const locked = drawings.every((d) => d.locked);
  const textColor = (caps.textColorKey === 'textColor' ? s.textColor : s.color) ?? s.color;
  const opacity = 100 - (s.transparency ?? 80);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [drawing.kind]);

  const fallback = { left: (bounds.width - size.w) / 2, top: EDGE_PX };
  const pos = clamp(saved ?? fallback, bounds, size);

  function openPopup(kind: NonNullable<Popup>['kind'], e: React.MouseEvent<HTMLElement>) {
    if (popup?.kind === kind) {
      setPopup(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setPopup({ kind, left: r.left, top: r.bottom + 6 });
  }

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, ...pos };
    let last = pos;
    const onMove = (ev: PointerEvent) => {
      last = clamp(
        { left: start.left + ev.clientX - start.x, top: start.top + ev.clientY - start.y },
        bounds,
        size
      );
      setSaved(last);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      savePosition(last);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function menuFor(kind: 'width' | 'style' | 'font' | 'more'): {
    label: string;
    entries: MenuEntry[];
  } {
    if (kind === 'width') {
      return {
        label: 'Line width',
        entries: LINE_WIDTHS.map((w) => ({
          type: 'item',
          id: String(w),
          label: `${w}px`,
          icon: <span className={styles.widthSample} style={{ height: w }} />,
          checked: s.width === w,
        })),
      };
    }
    if (kind === 'style') {
      return {
        label: 'Line style',
        entries: LINE_STYLES.map((ls) => ({
          type: 'item',
          id: ls.id,
          label: ls.label,
          icon: <span className={`${styles.styleSample} ${styles[ls.id]}`} />,
          checked: s.lineStyle === ls.id,
        })),
      };
    }
    if (kind === 'font') {
      return {
        label: 'Font size',
        entries: FONT_SIZES.map((f) => ({
          type: 'item',
          id: String(f),
          label: String(f),
          checked: (s.fontSize ?? 14) === f,
        })),
      };
    }
    return {
      label: 'More',
      entries: [
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
        ...(drawings.length === 1 && caps.limitOrder
          ? ([
              { type: 'separator', id: 'sep-order' },
              {
                type: 'item',
                id: 'limit-order',
                label: 'Create limit order…',
                icon: <ChartLine size={16} />,
              },
            ] satisfies MenuEntry[])
          : []),
        { type: 'separator', id: 'sep-1' },
        { type: 'item', id: 'front', label: 'Bring to front', icon: <ArrowUpToLine size={16} /> },
        { type: 'item', id: 'back', label: 'Send to back', icon: <ArrowDownToLine size={16} /> },
        { type: 'separator', id: 'sep-2' },
        { type: 'item', id: 'hide', label: 'Hide', icon: <EyeOff size={16} /> },
      ],
    };
  }

  function onMenuSelect(id: string) {
    const kind = popup?.kind;
    setPopup(null);
    if (kind === 'width') onStyle({ width: Number(id) });
    else if (kind === 'style') onStyle({ lineStyle: id as LineStyle });
    else if (kind === 'font') onStyle({ fontSize: Number(id) });
    else if (kind === 'more') onAction(id as DrawingMenuAction);
  }

  const menu =
    popup &&
    (popup.kind === 'width' ||
      popup.kind === 'style' ||
      popup.kind === 'font' ||
      popup.kind === 'more')
      ? menuFor(popup.kind)
      : null;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Drawing"
      className={styles.toolbar}
      style={{ left: pos.left, top: pos.top }}
      {...guide('drawing.toolbar')}
      // The chart under it never sees these presses (no deselect, no placement)
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span
        className={styles.handle}
        onPointerDown={startDrag}
        aria-hidden="true"
        data-tooltip="Drag to move the toolbar"
      >
        <GripVertical size={16} />
      </span>

      {caps.line && (
        <button
          type="button"
          className={styles.button}
          aria-label="Line colour"
          data-tooltip="Line colour"
          onClick={(e) => openPopup('line', e)}
        >
          <Pencil size={16} strokeWidth={1.5} />
          <span className={styles.colorBar} style={{ background: s.color }} />
        </button>
      )}
      {caps.fill && (
        <button
          type="button"
          className={styles.button}
          aria-label="Fill colour"
          data-tooltip="Fill colour"
          onClick={(e) => openPopup('fill', e)}
        >
          <PaintBucket size={16} strokeWidth={1.5} />
          <span
            className={styles.colorBar}
            style={{
              background:
                s.fillBackground === false ? 'transparent' : (s.backgroundColor ?? s.color),
            }}
          />
        </button>
      )}
      {caps.text && (
        <button
          type="button"
          className={styles.button}
          aria-label="Text colour"
          data-tooltip="Text colour"
          onClick={(e) => openPopup('text', e)}
        >
          <Type size={16} strokeWidth={1.5} />
          <span className={styles.colorBar} style={{ background: textColor }} />
        </button>
      )}
      {caps.line && (
        <>
          <button
            type="button"
            className={`${styles.button} ${styles.wide}`}
            aria-label={`Line width: ${s.width}px`}
            aria-haspopup="menu"
            data-tooltip="Line width"
            onClick={(e) => openPopup('width', e)}
          >
            <span className={styles.widthSample} style={{ height: s.width }} />
            <span className={styles.value}>{s.width}px</span>
          </button>
          <button
            type="button"
            className={styles.button}
            aria-label={`Line style: ${s.lineStyle}`}
            aria-haspopup="menu"
            data-tooltip="Line style"
            onClick={(e) => openPopup('style', e)}
          >
            <span className={`${styles.styleSample} ${styles[s.lineStyle]}`} />
          </button>
        </>
      )}
      {caps.text && (
        <button
          type="button"
          className={`${styles.button} ${styles.wide}`}
          aria-label={`Font size: ${s.fontSize ?? 14}`}
          aria-haspopup="menu"
          data-tooltip="Font size"
          onClick={(e) => openPopup('font', e)}
        >
          <span className={styles.value}>{s.fontSize ?? 14}</span>
        </button>
      )}

      <span className={styles.divider} />
      <button
        type="button"
        className={styles.button}
        aria-label="Settings"
        data-tooltip="Settings"
        onClick={onSettings}
      >
        <Settings size={16} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={`${styles.button}${locked ? ` ${styles.on}` : ''}`}
        aria-label={locked ? 'Unlock' : 'Lock'}
        aria-pressed={locked}
        data-tooltip={locked ? 'Unlock' : 'Lock'}
        onClick={onToggleLock}
      >
        {locked ? <Lock size={16} strokeWidth={1.5} /> : <LockOpen size={16} strokeWidth={1.5} />}
      </button>
      <button
        type="button"
        className={`${styles.button} ${styles.danger}`}
        aria-label="Remove"
        data-tooltip="Remove · Del"
        onClick={onRemove}
      >
        <Trash2 size={16} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={styles.button}
        aria-label="More"
        aria-haspopup="menu"
        data-tooltip="More"
        onClick={(e) => openPopup('more', e)}
      >
        <MoreHorizontal size={16} strokeWidth={1.5} />
      </button>

      {popup && (popup.kind === 'line' || popup.kind === 'text') && (
        <DrawingColorPopover
          label={popup.kind === 'line' ? 'Line colour' : 'Text colour'}
          value={popup.kind === 'line' ? s.color : textColor}
          position={popup}
          onChange={(c) =>
            onStyle(popup.kind === 'line' ? { color: c } : { [caps.textColorKey]: c })
          }
          onClose={() => setPopup(null)}
        />
      )}
      {popup?.kind === 'fill' && (
        <DrawingColorPopover
          label="Fill colour"
          value={s.backgroundColor ?? s.color}
          opacity={opacity}
          position={popup}
          onChange={(c) => onStyle({ backgroundColor: c, fillBackground: true })}
          onOpacityChange={(o) => onStyle({ transparency: 100 - o, fillBackground: true })}
          onClose={() => setPopup(null)}
        />
      )}
      {popup && menu && (
        <DrawingMenu
          label={menu.label}
          entries={menu.entries}
          position={popup}
          onSelect={onMenuSelect}
          onClose={() => setPopup(null)}
        />
      )}
      {tooltip}
    </div>
  );
}
