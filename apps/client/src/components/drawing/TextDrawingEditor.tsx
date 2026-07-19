// ─── TextDrawingEditor — on-chart HTML textarea overlay for editable P6 ─
//
// Mounts a <textarea> via createPortal to document.body, positioned over the
// drawing's anchor + measured box. Both the renderer (DrawingPrimitive) and
// this editor use the shared `textLayout.ts` helpers so the textarea bounds
// match the canvas box bounds exactly under pan/zoom.
//
// Lifecycle:
//   - Mount: focus + select all (so typing replaces empty placeholder)
//   - Shift+Enter            → newline
//   - Enter (no shift)       → commit + close
//   - Escape                 → cancel + discard + close
//   - Pointerdown inside the editor → interact (focus, click-to-position cursor, right-click context menu)
//   - Pointerdown outside the editor BUT inside the chart container → commit + close
//   - Pointerdown elsewhere (DrawingPropertiesMenu, ColorPicker, rest of the app) → leave editor open
//
// Right-click semantics: traditionally onBlur={commit} closed the editor any
// time the textarea lost focus — including spuriously when the user right-
// clicked anywhere on the chart (browser default removes focus from the
// previously-focused textarea on mousedown outside it). Mac's "right-click"
// (Ctrl+Click) registers as `button=0 + ctrlKey=true`, so lightweight-charts
// treats it as a left-click and fires subscribeClick → suspected absence of
// focus loss. We replace onBlur with a document-level pointerdown capture
// listener that ONLY commits + closes when the click lands on the chart
// container (not the editor portal, not other UI). This matches the user's
// mental model of "right-click in the editor keeps the editor open".
//
// Repositioning on pan/zoom is driven by the parent chart re-rendering this
// portal each time `viewportVersion` changes (passed as a `repositionKey`
// dependency so this effect re-runs).
//
// 🔐 Fix 8 — live label preview. While the editor is open the user's draft
// text lives only in the local `value` state; the canvas-rendered glyph is
// sized from `drawing.label` (the store), which is still the pre-edit/empty
// string until commit. Until they diverge, the textarea (sized from `value`)
// and the canvas text (sized from `drawing.label`) use DIFFERENT box widths
// — so panning the chart displaced the canvas text and the textarea overlay
// at different rates ("swimming"). We now push every keystroke back into
// the store via `onPreview` so the canvas and the textarea always derive
// their boxes from the same string, and `onCancel` reverts the label to the
// mount-time snapshot so Escape discards the draft cleanly.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { motion } from 'framer-motion';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Drawing } from '@/lib/drawing/types';
import { color, font } from '@/lib/tokens';
import { useDrawingStore } from '@/store/drawingStore';
import {
  BOX_PADDING_PX,
  FONT_FAMILY,
  TEXT_LINE_HEIGHT,
  fontCssShorthand,
  computeAnnotationBox,
} from '@/lib/drawing/textLayout';

interface TextDrawingEditorProps {
  drawing: Drawing;
  chartRef: RefObject<IChartApi | null>;
  seriesRef: RefObject<ISeriesApi<'Candlestick'> | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Bumped by the parent chart on pan/zoom so we recompute screen position.
   *  Optional — when omitted, the editor stays put until the next render. */
  repositionKey?: number;
  /** Live preview write — called on every keystroke so the canvas-rendered
   *  label (sized from the store) stays in sync with the textarea (sized from
   *  local `value`). Without this the two diverge during pan ("swimming").
   *  Optional with a no-op default so standalone test renders don't need it. */
  onPreview?: (id: string, text: string) => void;
  /** Called with the new label text. Empty string clears the label. Finalizes
   *  the live preview already written by `onPreview` and closes the editor. */
  onCommit: (id: string, text: string) => void;
  /** Called when the user escapes — reverts the label to the mount-time
   *  snapshot (discarding the draft written by `onPreview`) and closes. */
  onCancel: () => void;
}

export function TextDrawingEditor({
  drawing,
  chartRef,
  seriesRef,
  containerRef,
  repositionKey = 0,
  onPreview,
  onCommit,
  onCancel,
}: TextDrawingEditorProps) {
  const preview = onPreview ?? (() => {});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(drawing.label ?? '');

  // 🔐 Fix 8 — snapshot the label as it was on mount so Escape can revert the
  // live preview written on each keystroke back to the pre-edit value. A ref
  // (not state) — captured once and never re-sampled, otherwise reopening the
  // editor on an already-edited drawing would treat the draft as the baseline.
  const initialLabelRef = useRef<string>(drawing.label ?? '');

  // 🔐 latest-commit ref — kept fresh via an effect so the document-level
  // pointerdown listener (registered once on mount) closes over a stable
  // commitRef instead of recreating the listener on every keystroke.
  const commitRef = useRef<() => void>(() => {});
  useEffect(() => {
    commitRef.current = () => onCommit(drawing.id, value);
  }, [drawing.id, value, onCommit]);

  // 🔐 Commit-on-outside-chart-click listener. Replaces the brittle
  // onBlur={commit} approach (which fired spuriously on any focus loss —
  // including right-click outside the textarea — and incorrectly committed
  // when the chart contextmenu handler deselected + exited drawing mode).
  //
  // The listener fires in the **capture** phase on `document`, before any
  // chart container event listener. That ordering matters because:
  //   1. Lightweight-charts' `_mouseDownHandler` registers `mouseup` on the
  //      documentElement when the chart canvas receives a left-click. Without
  //      our listener firing first, the subsequent `subscribeClick` would
  //      spawn a new empty text drawing at the click coordinates, switching
  //      the editor to it — losing any in-progress text in the previous
  //      drawing (the OLD editor's mount path doesn't commit; React just
  //      diff-remounts with the new drawing's empty label).
  //   2. Mac right-click is Ctrl+Click (button=0 + ctrlKey=true). The
  //      browser fires a `contextmenu` event after the synthetic click, so
  //      the chart's existing contextmenu handler exits drawing mode. Our
  //      listener commits the editor BEFORE that handler runs, so the
  //      user's text is persisted and the editor closes cleanly.
  //
  // We deliberately do NOT commit when the pointer lands elsewhere (the
  // floating DrawingPropertiesMenu portal, the ColorPicker portal, or other
  // UI). The user can change color / line weight while the text editor stays
  // open — that matches TradingView.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Click inside the editor itself (textarea, motion.div, any descendant)
      // → don't commit. User is interacting with the editor (cursor position,
      // browser context menu for Cut/Copy/Paste, etc.).
      if (target.closest('[data-text-drawing-editor]')) return;

      // Click inside the chart container (chart canvas, axes) → commit + close.
      // The editor is in a portal to document.body, so the chart container is
      // not an ancestor of the editor; this is why we explicitly check
      // `containerRef.current.contains(target)` rather than relying on the
      // `data-text-drawing-editor` marker.
      const container = containerRef.current;
      if (!container || !container.contains(target)) return;

      commitRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown, /* capture */ true);
    return () => document.removeEventListener('pointerdown', onPointerDown, /* capture */ true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy offscreen canvas context used only for measuring text width — same
  // approach the DrawingPrimitive uses for its hit-test (mirroring the box
  // bounds computed by `computeAnnotationBox` so the textarea and the
  // canvas text overlap exactly under pan/zoom).
  const measuringCtx = useMemo<CanvasRenderingContext2D | null>(() => {
    try {
      return document.createElement('canvas').getContext('2d');
    } catch {
      return null;
    }
  }, []);

  // Position — recomputed each render; the parent chart re-mounts the
  // portal each time `repositionKey` changes.
  const [pos, setPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const chart = chartRef.current;
    const series = seriesRef.current;
    const container = containerRef.current;
    if (!chart || !series || !container || !measuringCtx) {
      setPos(null);
      return;
    }
    if (drawing.shape.points.length < 1) {
      setPos(null);
      return;
    }
    const p = drawing.shape.points[0]!;
    const ax = chart.timeScale().timeToCoordinate(p.time);
    const ay = series.priceToCoordinate(p.price);
    if (ax === null || ay === null) {
      setPos(null);
      return;
    }
    const box = computeAnnotationBox(measuringCtx, drawing, ax, ay);
    if (!box) {
      setPos(null);
      return;
    }
    const rect = container.getBoundingClientRect();
    setPos({
      x: rect.left + box.x,
      y: rect.top + box.y,
      w: Math.max(box.w, 80),
      h: Math.max(box.h, 28),
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [drawing, chartRef, seriesRef, containerRef, measuringCtx, repositionKey]);

  // Autofocus + select-all on mount so typing replaces the empty placeholder.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  }, []);

  function commit() {
    onCommit(drawing.id, value);
  }

  if (!pos) return null;

  const fontSize = drawing.fontSize;
  const isBareText = drawing.shape.type === 'text';
  const dimensionStyle: React.CSSProperties = {
    position: 'fixed',
    left: pos.x,
    top: pos.y,
    width: pos.w,
    height: pos.h,
    background: isBareText ? 'transparent' : drawing.backgroundColor,
    color: drawing.textColor,
    font: fontCssShorthand(fontSize, FONT_FAMILY),
    border: `1px solid ${color.purple}`,
    borderRadius: 6,
    padding: isBareText ? 0 : BOX_PADDING_PX,
    outline: 'none',
    resize: 'none',
    overflow: 'hidden',
    textAlign: 'left',
    fontFamily: font.sans,
    lineHeight: TEXT_LINE_HEIGHT,
    fontSize,
    zIndex: 200,
    boxShadow: `0 0 0 2px ${color.purpleDark}30`,
  };

  return (
    <motion.div
      data-text-drawing-editor
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.08 }}
      style={{ position: 'fixed', left: 0, top: 0, zIndex: 200 }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          // 🔐 Fix 8 — push the draft into the store immediately so the canvas
          // renderer sizes its box from the same string the textarea shows.
          // Keeps them pixel-aligned during pan (kills the "swimming").
          preview(drawing.id, next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            // 🔐 Fix 8 — revert the live preview written during typing
            // back to the mount-time snapshot, then close.
            useDrawingStore.getState().updateDrawing(drawing.id, {
              label: initialLabelRef.current,
            });
            onCancel();
          }
        }}
        placeholder="Enter text"
        spellCheck={false}
        style={dimensionStyle}
        // Click inside the textarea shouldn't propagate to the chart's
        // pointer handlers — we don't want a stray mousedown to fire a
        // chart click that deselects or starts a new drawing.
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>
  );
}
