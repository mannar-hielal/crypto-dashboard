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
//   - Blur                   → commit + close
//   - Escape                 → cancel + discard + close
//
// Repositioning on pan/zoom is driven by the parent chart re-rendering this
// portal each time `viewportVersion` changes (passed as a `repositionKey`
// dependency so this effect re-runs).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { motion } from 'framer-motion';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Drawing } from '@/lib/drawing/types';
import { color, font } from '@/lib/tokens';
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
  /** Called with the new label text. Empty string clears the label. */
  onCommit: (id: string, text: string) => void;
  /** Called when the user escapes — discards any in-progress edits. */
  onCancel: () => void;
}

export function TextDrawingEditor({
  drawing,
  chartRef,
  seriesRef,
  containerRef,
  repositionKey = 0,
  onCommit,
  onCancel,
}: TextDrawingEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(drawing.label ?? '');

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

  useEffect(() => {
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
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.08 }}
      style={{ position: 'fixed', left: 0, top: 0, pointerEvents: 'none', zIndex: 200 }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
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
      />
    </motion.div>
  );
}
