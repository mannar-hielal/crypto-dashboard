// ─── DrawingPrimitive — ISeriesPrimitive for trendline rendering ───

import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { RefObject } from 'react';
import type { Drawing, DrawingPoint, InProgressDrawing } from '@/lib/drawing/types';
import { pointToSegmentDist, pointToRayDist, pointInRect } from '@/lib/drawing/coordinates';
import {
  BOX_PADDING_PX,
  BOX_RADIUS_PX,
  PILL_RADIUS_PX,
  TEXT_LINE_HEIGHT,
  FONT_FAMILY,
  splitLines,
  formatPriceLabel,
  computeAnnotationBox,
} from '@/lib/drawing/textLayout';

// ─── Per-shape draw helpers ────────────────────────────────────────

function applyStrokeStyle(ctx: CanvasRenderingContext2D, drawing: Drawing, hpr: number) {
  ctx.lineWidth = drawing.lineWidth * hpr;
  ctx.strokeStyle = drawing.color;
  ctx.lineCap = 'round';
  if (drawing.lineStyle === 'dashed') {
    ctx.setLineDash([8 * drawing.lineWidth * hpr, 4 * drawing.lineWidth * hpr]);
  } else if (drawing.lineStyle === 'dotted') {
    ctx.setLineDash([drawing.lineWidth * hpr, 3 * drawing.lineWidth * hpr]);
  } else {
    ctx.setLineDash([]);
  }
}

function drawHandlesAt(
  ctx: CanvasRenderingContext2D,
  hpr: number,
  points: { x: number; y: number }[],
  color: string
) {
  const handleR = Math.round(6 * hpr);
  const strokeW = Math.round(2 * hpr);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeW;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, handleR, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabelAt(
  ctx: CanvasRenderingContext2D,
  vpr: number,
  bx: number,
  by: number,
  angle: number,
  label: string,
  textColor: string
) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(angle);
  ctx.font = `24px "Geist Variable", -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = textColor;
  ctx.fillText(label, 0, -8 * vpr);
  ctx.restore();
}

/**
 * Draws a trendline or ray. If `extendPastB`, the line extends from A
 * through B to the appropriate chart edge (ray).
 */
function drawLineShape(
  ctx: CanvasRenderingContext2D,
  hpr: number,
  vpr: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  p1: DrawingPoint,
  p2: DrawingPoint,
  drawing: Drawing,
  isSelected: boolean,
  extendPastB: boolean
) {
  const x1 = chart.timeScale().timeToCoordinate(p1.time);
  const y1 = series.priceToCoordinate(p1.price);
  const x2 = chart.timeScale().timeToCoordinate(p2.time);
  const y2 = series.priceToCoordinate(p2.price);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return;

  let endX = Math.round(x2 * hpr);
  let endY = Math.round(y2 * vpr);

  if (extendPastB) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const bitmapW = ctx.canvas.width;
    const bitmapH = ctx.canvas.height;
    let t: number;
    if (dx > 0) {
      // Extend rightward to right edge
      t = (bitmapW / hpr - x1) / dx;
    } else if (dx < 0) {
      // Extend leftward to left edge (x = 0)
      t = -x1 / dx;
    } else if (dy > 0) {
      // Vertical downward — extend to bottom edge
      t = (bitmapH / vpr - y1) / dy;
    } else if (dy < 0) {
      // Vertical upward — extend to top edge (y = 0)
      t = -y1 / dy;
    } else {
      // A === B, nothing to extend
      t = 1;
    }
    const clamp = Math.max(1, t);
    endX = Math.round((x1 + clamp * dx) * hpr);
    endY = Math.round((y1 + clamp * dy) * vpr);
  }

  const bx1 = Math.round(x1 * hpr);
  const by1 = Math.round(y1 * vpr);

  ctx.save();
  applyStrokeStyle(ctx, drawing, hpr);
  ctx.beginPath();
  ctx.moveTo(bx1, by1);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (drawing.label) {
    drawLabelAt(
      ctx,
      vpr,
      (bx1 + endX) / 2,
      (by1 + endY) / 2,
      Math.atan2(endY - by1, endX - bx1),
      drawing.label,
      drawing.textColor
    );
  }

  if (isSelected) {
    drawHandlesAt(
      ctx,
      hpr,
      [
        { x: bx1, y: by1 },
        { x: Math.round(x2 * hpr), y: Math.round(y2 * vpr) },
      ],
      drawing.color
    );
  }
}

/**
 * Draws a horizontal line spanning the full chart width at the price
 * of the single anchor point.
 */
function drawHorizontalShape(
  ctx: CanvasRenderingContext2D,
  hpr: number,
  vpr: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  point: DrawingPoint,
  drawing: Drawing,
  isSelected: boolean
) {
  const y = series.priceToCoordinate(point.price);
  if (y === null) return;
  const by = Math.round(y * vpr);
  const bitmapW = ctx.canvas.width;

  ctx.save();
  applyStrokeStyle(ctx, drawing, hpr);
  ctx.beginPath();
  ctx.moveTo(0, by);
  ctx.lineTo(bitmapW, by);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (drawing.label) {
    const x = chart.timeScale().timeToCoordinate(point.time);
    if (x !== null) {
      drawLabelAt(ctx, vpr, Math.round(x * hpr), by, 0, drawing.label, drawing.textColor);
    }
  }

  if (isSelected) {
    const x = chart.timeScale().timeToCoordinate(point.time);
    if (x !== null) {
      drawHandlesAt(ctx, hpr, [{ x: Math.round(x * hpr), y: by }], drawing.color);
    }
  }
}

/**
 * Draws a vertical line spanning the full chart height at the time of
 * the single anchor point.
 */
function drawVerticalShape(
  ctx: CanvasRenderingContext2D,
  hpr: number,
  vpr: number,
  chart: IChartApi,
  _series: ISeriesApi<'Candlestick'>,
  point: DrawingPoint,
  drawing: Drawing,
  isSelected: boolean
) {
  const x = chart.timeScale().timeToCoordinate(point.time);
  if (x === null) return;
  const bx = Math.round(x * hpr);
  const bitmapH = ctx.canvas.height;

  ctx.save();
  applyStrokeStyle(ctx, drawing, hpr);
  ctx.beginPath();
  ctx.moveTo(bx, 0);
  ctx.lineTo(bx, bitmapH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (drawing.label) {
    const y = _series.priceToCoordinate(point.price);
    if (y !== null) {
      drawLabelAt(ctx, vpr, bx, Math.round(y * vpr), Math.PI / 2, drawing.label, drawing.textColor);
    }
  }

  if (isSelected) {
    const y = _series.priceToCoordinate(point.price);
    if (y !== null) {
      drawHandlesAt(ctx, hpr, [{ x: bx, y: Math.round(y * vpr) }], drawing.color);
    }
  }
}

/**
 * Draws a parallel channel: base line A→B + offset line C→C+(B−A).
 * Optionally fills the area between the two lines with a translucent colour.
 */
function drawParallelShape(
  ctx: CanvasRenderingContext2D,
  hpr: number,
  vpr: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  pA: DrawingPoint,
  pB: DrawingPoint,
  pC: DrawingPoint,
  drawing: Drawing,
  isSelected: boolean
) {
  const ax = chart.timeScale().timeToCoordinate(pA.time);
  const ay = series.priceToCoordinate(pA.price);
  const bx = chart.timeScale().timeToCoordinate(pB.time);
  const by = series.priceToCoordinate(pB.price);
  const cx = chart.timeScale().timeToCoordinate(pC.time);
  const cy = series.priceToCoordinate(pC.price);
  if (ax === null || ay === null || bx === null || by === null || cx === null || cy === null)
    return;

  const dx = bx - ax;
  const dy = by - ay;

  const bax = Math.round(ax * hpr);
  const bay = Math.round(ay * vpr);
  const bbx = Math.round(bx * hpr);
  const bby = Math.round(by * vpr);
  const bcx = Math.round(cx * hpr);
  const bcy = Math.round(cy * vpr);
  const bdx = Math.round((cx + dx) * hpr);
  const bdy = Math.round((cy + dy) * vpr);

  // ── Fill between the two lines (translucent) ──────────────────────
  ctx.save();
  ctx.fillStyle = drawing.color + '20'; // ~12% opacity hex suffix
  ctx.beginPath();
  ctx.moveTo(bax, bay);
  ctx.lineTo(bbx, bby);
  ctx.lineTo(bdx, bdy);
  ctx.lineTo(bcx, bcy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── Base line A→B ─────────────────────────────────────────────────
  ctx.save();
  applyStrokeStyle(ctx, drawing, hpr);
  ctx.beginPath();
  ctx.moveTo(bax, bay);
  ctx.lineTo(bbx, bby);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── Offset line C→C+(B−A) ─────────────────────────────────────────
  ctx.save();
  applyStrokeStyle(ctx, drawing, hpr);
  ctx.beginPath();
  ctx.moveTo(bcx, bcy);
  ctx.lineTo(bdx, bdy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── Label at midpoint of base line ───────────────────────────────
  if (drawing.label) {
    drawLabelAt(
      ctx,
      vpr,
      (bax + bbx) / 2,
      (bay + bby) / 2,
      Math.atan2(bby - bay, bbx - bax),
      drawing.label,
      drawing.textColor
    );
  }

  // ── Handles (3 when selected) ────────────────────────────────────
  if (isSelected) {
    drawHandlesAt(
      ctx,
      hpr,
      [
        { x: bax, y: bay },
        { x: bbx, y: bby },
        { x: bcx, y: bcy },
      ],
      drawing.color
    );
  }
}

/**
 * Draws a polyline: a series of connected line segments through N points.
 */
function drawPolylineShape(
  ctx: CanvasRenderingContext2D,
  hpr: number,
  vpr: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  points: DrawingPoint[],
  drawing: Drawing,
  isSelected: boolean
) {
  if (points.length < 2) return;

  // Convert all points to bitmap coords
  const bitmapPts: { x: number; y: number }[] = [];
  for (const p of points) {
    const x = chart.timeScale().timeToCoordinate(p.time);
    const y = series.priceToCoordinate(p.price);
    if (x === null || y === null) return;
    bitmapPts.push({ x: Math.round(x * hpr), y: Math.round(y * vpr) });
  }

  // Draw connected segments
  ctx.save();
  applyStrokeStyle(ctx, drawing, hpr);
  ctx.beginPath();
  ctx.moveTo(bitmapPts[0]!.x, bitmapPts[0]!.y);
  for (let i = 1; i < bitmapPts.length; i++) {
    ctx.lineTo(bitmapPts[i]!.x, bitmapPts[i]!.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Label at midpoint of first segment
  if (drawing.label && bitmapPts.length >= 2) {
    drawLabelAt(
      ctx,
      vpr,
      (bitmapPts[0]!.x + bitmapPts[1]!.x) / 2,
      (bitmapPts[0]!.y + bitmapPts[1]!.y) / 2,
      Math.atan2(bitmapPts[1]!.y - bitmapPts[0]!.y, bitmapPts[1]!.x - bitmapPts[0]!.x),
      drawing.label,
      drawing.textColor
    );
  }

  if (isSelected) {
    drawHandlesAt(ctx, hpr, bitmapPts, drawing.color);
  }
}

// ─── P6 text & notes draw helpers ────────────────────────────────────
//
// All five annotation shapes are single-anchor. They render a box-or-pill
// around the anchor (note/callout/priceNote box, priceLabel pill) or just
// the text itself (text). All return null when the anchor's screen coords
// are not resolvable — the renderer's `draw()` switch then `continue`s.

/** Re-exported here so call sites inside DrawingPrimitive can call the shared
 *  computeAnnotationBox without changing the local style. */
function computeBox(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  x: number,
  y: number
): { x: number; y: number; w: number; h: number } | null {
  return computeAnnotationBox(ctx, drawing, x, y);
}

/** Single-line drawing helper that paints a rounded price pill centered at
 *  (cx, cy) in CSS pixels. Used by both PriceNote (right-edge pill) and
 *  PriceLabel (anchor-centered pill). Returns the pill's CSS bounds so the
 *  caller's hit-test (pointInRect) + textarea editor can mirror geometry. */
function renderPricePill(
  ctx: CanvasRenderingContext2D,
  hpr: number,
  vpr: number,
  cx: number,
  cy: number,
  text: string,
  fill: string,
  textColor: string,
  fontSize: number,
  paddingCss: number,
  border: string | null = null,
  borderW: number = 1,
  radiusCss: number = PILL_RADIUS_PX
): { x: number; y: number; w: number; h: number } {
  ctx.save();
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  const textW = ctx.measureText(text).width;
  const pillW = Math.ceil(textW + paddingCss * 2);
  const pillH = Math.round(fontSize + paddingCss);
  const px = Math.round(cx * hpr);
  const py = Math.round(cy * vpr);
  const pw = Math.round(pillW * hpr);
  const ph = Math.round(pillH * vpr);
  const r = radiusCss * hpr;
  ctx.beginPath();
  if (typeof (ctx as CanvasRenderingContext2D).roundRect === 'function') {
    ctx.roundRect(px - pw / 2, py - ph / 2, pw, ph, r);
  } else {
    // Fallback rounded rect path
    ctx.moveTo(px - pw / 2 + r, py - ph / 2);
    ctx.arcTo(px + pw / 2, py - ph / 2, px + pw / 2, py + ph / 2, r);
    ctx.arcTo(px + pw / 2, py + ph / 2, px - pw / 2, py + ph / 2, r);
    ctx.arcTo(px - pw / 2, py + ph / 2, px - pw / 2, py - ph / 2, r);
    ctx.arcTo(px - pw / 2, py - ph / 2, px + pw / 2, py - ph / 2, r);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (border && borderW > 0) {
    ctx.lineWidth = borderW * hpr;
    ctx.strokeStyle = border;
    ctx.stroke();
  }
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px, py + 0 * hpr);
  ctx.restore();
  return {
    x: cx - pillW / 2,
    y: cy - pillH / 2,
    w: pillW,
    h: pillH,
  };
}

/** Filled rounded rectangle path. Caller closes/fills/strokes. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  ctx.beginPath();
  if (typeof (ctx as CanvasRenderingContext2D).roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
  }
  ctx.closePath();
}

/** Multiline text fill centered vertically in a box of height `h`. Used by
 *  text/note/callout/priceNote bodies. */
function fillMultilineText(
  ctx: CanvasRenderingContext2D,
  text: string | undefined,
  fontSize: number,
  fill: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  paddingPx: number
) {
  void boxW;
  const lines = splitLines(text);
  const lineH = Math.round(fontSize * TEXT_LINE_HEIGHT);
  const visibleLines = Math.max(1, lines.length);
  ctx.save();
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = fill;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // Vertically center the text block within the box
  const blockH = lineH * visibleLines;
  if (lines.length === 0) {
    // Empty — no fill, just reset state
    void blockH;
    ctx.restore();
    return;
  }
  let startY = boxY + (boxH - blockH) / 2;
  for (const ln of lines) {
    ctx.fillText(ln, boxX + paddingPx, startY);
    startY += lineH;
  }
  ctx.restore();
}

/** Drawing-specific renderer dispatch for the P6 single-anchor shapes.
 *  Returns the box the shape occupied (in CSS pixels) so the caller's hit
 *  test + textarea editor can mirror its geometry. */
function drawTextNoteShape(
  ctx: CanvasRenderingContext2D,
  hpr: number,
  vpr: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  drawing: Drawing,
  isSelected: boolean,
  isHoveredForEraser: boolean
): { x: number; y: number; w: number; h: number } | null {
  const p = drawing.shape.points[0];
  if (!p) return null;
  const ax = chart.timeScale().timeToCoordinate(p.time);
  const ay = series.priceToCoordinate(p.price);
  if (ax === null || ay === null) return null;

  const box = computeBox(ctx, drawing, ax, ay);
  if (!box) return null;
  const bX = Math.round(box.x * hpr);
  const bY = Math.round(box.y * vpr);
  const bW = Math.round(box.w * hpr);
  const bH = Math.round(box.h * vpr);
  const fontSize = drawing.fontSize;
  const padding = drawing.shape.type === 'text' ? 1 : BOX_PADDING_PX;

  switch (drawing.shape.type) {
    case 'text': {
      fillMultilineText(
        ctx,
        drawing.label,
        fontSize,
        drawing.textColor,
        box.x,
        box.y,
        box.w,
        box.h,
        padding
      );
      break;
    }
    case 'note':
    case 'priceNote': {
      // Box
      ctx.save();
      roundRectPath(ctx, bX, bY, bW, bH, BOX_RADIUS_PX * hpr);
      ctx.fillStyle = drawing.backgroundColor;
      ctx.fill();
      ctx.lineWidth = drawing.lineWidth * hpr;
      ctx.strokeStyle = drawing.color;
      // Box borders stay solid — applyStrokeStyle would dash them
      ctx.stroke();
      ctx.restore();

      // Body text
      fillMultilineText(
        ctx,
        drawing.label,
        fontSize,
        drawing.textColor,
        box.x,
        box.y,
        box.w,
        box.h,
        BOX_PADDING_PX
      );

      // Small pin circle at anchor
      ctx.save();
      ctx.fillStyle = drawing.color;
      ctx.beginPath();
      ctx.arc(Math.round(ax * hpr), Math.round(ay * vpr), Math.round(3 * hpr), 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      // Price note extras — dashed lead line to right-edge pill
      if (drawing.shape.type === 'priceNote') {
        const rightEdge = ctx.canvas.width;
        const pillXCss = rightEdge / hpr - 60; // 60px gutter inset for the pill column
        // Dashed lead line from box-right to pill-left
        ctx.save();
        ctx.setLineDash([6 * hpr, 3 * hpr]);
        ctx.strokeStyle = drawing.color + '90';
        ctx.lineWidth = drawing.lineWidth * hpr;
        ctx.beginPath();
        ctx.moveTo(bX + bW, Math.round(ay * vpr));
        ctx.lineTo(Math.round(pillXCss * hpr), Math.round(ay * vpr));
        ctx.stroke();
        ctx.restore();

        // Right-edge price pill
        renderPricePill(
          ctx,
          hpr,
          vpr,
          pillXCss,
          ay,
          formatPriceLabel(p.price),
          drawing.color,
          drawing.textColor,
          fontSize,
          8,
          drawing.color,
          drawing.lineWidth
        );
      }
      break;
    }
    case 'callout': {
      // Leader tail from anchor to bottom-center of box
      ctx.save();
      ctx.strokeStyle = drawing.color;
      ctx.lineWidth = drawing.lineWidth * hpr;
      ctx.beginPath();
      ctx.moveTo(Math.round(ax * hpr), Math.round(ay * vpr));
      ctx.lineTo(Math.round((box.x + box.w / 2) * hpr), Math.round((box.y + box.h) * vpr));
      ctx.stroke();
      ctx.restore();

      // Box
      ctx.save();
      roundRectPath(ctx, bX, bY, bW, bH, BOX_RADIUS_PX * hpr);
      ctx.fillStyle = drawing.backgroundColor;
      ctx.fill();
      ctx.lineWidth = drawing.lineWidth * hpr;
      ctx.strokeStyle = drawing.color;
      ctx.stroke();
      ctx.restore();

      // Body text
      fillMultilineText(
        ctx,
        drawing.label,
        fontSize,
        drawing.textColor,
        box.x,
        box.y,
        box.w,
        box.h,
        BOX_PADDING_PX
      );
      break;
    }
    case 'priceLabel': {
      renderPricePill(
        ctx,
        hpr,
        vpr,
        ax,
        ay,
        formatPriceLabel(p.price),
        drawing.color,
        drawing.textColor,
        fontSize,
        8,
        drawing.color,
        drawing.lineWidth
      );
      break;
    }
  }

  if (isSelected || isHoveredForEraser) {
    drawHandlesAt(ctx, hpr, [{ x: Math.round(ax * hpr), y: Math.round(ay * vpr) }], drawing.color);
  }

  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

// ─── Renderer ──────────────────────────────────────────────────────

class TrendlineRenderer implements IPrimitivePaneRenderer {
  private _primitive: DrawingPrimitive;

  constructor(primitive: DrawingPrimitive) {
    this._primitive = primitive;
  }

  draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]) {
    target.useBitmapCoordinateSpace(
      (scope: {
        context: CanvasRenderingContext2D;
        mediaSize: { width: number; height: number };
        bitmapSize: { width: number; height: number };
        horizontalPixelRatio: number;
        verticalPixelRatio: number;
      }) => {
        const ctx = scope.context;
        const hpr = scope.horizontalPixelRatio;
        const vpr = scope.verticalPixelRatio;
        const chart = this._primitive._chart;
        const series = this._primitive._series;
        if (!chart || !series) return;

        // ── In-progress preview (dashed) ─────────────────────────
        const ip = this._primitive._inProgressRef.current;
        if (ip && ip.points.length === 1 && ip.hoverPoint) {
          // 2-click tools (trendline, ray): A placed, preview A→cursor
          const x1 = chart.timeScale().timeToCoordinate(ip.points[0].time);
          const y1 = series.priceToCoordinate(ip.points[0].price);
          const x2 = chart.timeScale().timeToCoordinate(ip.hoverPoint.time);
          const y2 = series.priceToCoordinate(ip.hoverPoint.price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            ctx.save();
            ctx.setLineDash([6 * hpr, 3 * hpr]);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1 * hpr;
            ctx.beginPath();
            ctx.moveTo(Math.round(x1 * hpr), Math.round(y1 * vpr));
            ctx.lineTo(Math.round(x2 * hpr), Math.round(y2 * vpr));
            ctx.stroke();
            ctx.restore();
          }
        } else if (ip && ip.type === 'parallel' && ip.points.length === 2 && ip.hoverPoint) {
          // 3-click parallel: A & B placed, preview A→B solid white + dashed C(hover)→C+(B−A)
          const ax = chart.timeScale().timeToCoordinate(ip.points[0].time);
          const ay = series.priceToCoordinate(ip.points[0].price);
          const bx = chart.timeScale().timeToCoordinate(ip.points[1].time);
          const by = series.priceToCoordinate(ip.points[1].price);
          const cx = chart.timeScale().timeToCoordinate(ip.hoverPoint.time);
          const cy = series.priceToCoordinate(ip.hoverPoint.price);
          if (
            ax !== null &&
            ay !== null &&
            bx !== null &&
            by !== null &&
            cx !== null &&
            cy !== null
          ) {
            const ddx = bx - ax;
            const ddy = by - ay;
            // Base line A→B (solid white)
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1 * hpr;
            ctx.beginPath();
            ctx.moveTo(Math.round(ax * hpr), Math.round(ay * vpr));
            ctx.lineTo(Math.round(bx * hpr), Math.round(by * vpr));
            ctx.stroke();
            ctx.restore();
            // Offset line C(hover)→C+(B−A) (dashed)
            ctx.save();
            ctx.setLineDash([6 * hpr, 3 * hpr]);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 1 * hpr;
            ctx.beginPath();
            ctx.moveTo(Math.round(cx * hpr), Math.round(cy * vpr));
            ctx.lineTo(Math.round((cx + ddx) * hpr), Math.round((cy + ddy) * vpr));
            ctx.stroke();
            ctx.restore();
          }
        } else if (ip && ip.type === 'polyline' && ip.points.length >= 1 && ip.hoverPoint) {
          // Polyline: show placed segments solid + dashed segment to cursor
          const placed: { x: number; y: number }[] = [];
          let allValid = true;
          for (const p of ip.points) {
            const px = chart.timeScale().timeToCoordinate(p.time);
            const py = series.priceToCoordinate(p.price);
            if (px === null || py === null) {
              allValid = false;
              break;
            }
            placed.push({ x: Math.round(px * hpr), y: Math.round(py * vpr) });
          }
          const hx = chart.timeScale().timeToCoordinate(ip.hoverPoint.time);
          const hy = series.priceToCoordinate(ip.hoverPoint.price);
          if (allValid && hx !== null && hy !== null) {
            // Solid placed segments
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1 * hpr;
            ctx.beginPath();
            ctx.moveTo(placed[0]!.x, placed[0]!.y);
            for (let i = 1; i < placed.length; i++) {
              ctx.lineTo(placed[i]!.x, placed[i]!.y);
            }
            ctx.stroke();
            ctx.restore();
            // Dashed segment to cursor
            const last = placed[placed.length - 1]!;
            const bx = Math.round(hx * hpr);
            const by = Math.round(hy * vpr);
            ctx.save();
            ctx.setLineDash([6 * hpr, 3 * hpr]);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 1 * hpr;
            ctx.beginPath();
            ctx.moveTo(last.x, last.y);
            ctx.lineTo(bx, by);
            ctx.stroke();
            ctx.restore();
          }
        }

        // ── Committed drawings (trendline, ray, horizontal, vertical) ────
        const drawings = this._primitive._drawingsRef.current;
        const selectedId = this._primitive._selectedIdRef.current;
        const isEraser = this._primitive._cursorVariantRef.current === 'eraser';
        const hoveredId = isEraser ? this._primitive._hoveredIdRef.current : null;

        for (const drawing of drawings) {
          switch (drawing.shape.type) {
            case 'trendline':
            case 'ray': {
              if (drawing.shape.points.length < 2) continue;
              drawLineShape(
                ctx,
                hpr,
                vpr,
                chart,
                series,
                drawing.shape.points[0],
                drawing.shape.points[1],
                drawing,
                drawing.id === selectedId || drawing.id === hoveredId,
                drawing.shape.type === 'ray' // extend past B
              );
              break;
            }
            case 'horizontal': {
              if (drawing.shape.points.length < 1) continue;
              drawHorizontalShape(
                ctx,
                hpr,
                vpr,
                chart,
                series,
                drawing.shape.points[0],
                drawing,
                drawing.id === selectedId || drawing.id === hoveredId
              );
              break;
            }
            case 'vertical': {
              if (drawing.shape.points.length < 1) continue;
              drawVerticalShape(
                ctx,
                hpr,
                vpr,
                chart,
                series,
                drawing.shape.points[0],
                drawing,
                drawing.id === selectedId || drawing.id === hoveredId
              );
              break;
            }
            case 'parallel': {
              if (drawing.shape.points.length < 3) continue;
              drawParallelShape(
                ctx,
                hpr,
                vpr,
                chart,
                series,
                drawing.shape.points[0],
                drawing.shape.points[1],
                drawing.shape.points[2],
                drawing,
                drawing.id === selectedId || drawing.id === hoveredId
              );
              break;
            }
            case 'polyline': {
              if (drawing.shape.points.length < 2) continue;
              drawPolylineShape(
                ctx,
                hpr,
                vpr,
                chart,
                series,
                drawing.shape.points,
                drawing,
                drawing.id === selectedId || drawing.id === hoveredId
              );
              break;
            }
            // P6 — text & notes shapes (all single-anchor)
            case 'text':
            case 'note':
            case 'callout':
            case 'priceNote':
            case 'priceLabel': {
              if (drawing.shape.points.length < 1) continue;
              drawTextNoteShape(
                ctx,
                hpr,
                vpr,
                chart,
                series,
                drawing,
                drawing.id === selectedId,
                drawing.id === hoveredId
              );
              break;
            }
          }
        }
      }
    );
  }
}

// ─── Pane View ─────────────────────────────────────────────────────

class TrendlinePaneView implements IPrimitivePaneView {
  private _renderer: TrendlineRenderer;

  constructor(primitive: DrawingPrimitive) {
    this._renderer = new TrendlineRenderer(primitive);
  }

  zOrder() {
    return 'top' as const;
  }

  renderer(): IPrimitivePaneRenderer | null {
    return this._renderer;
  }
}

// ─── DrawingPrimitive (main) ───────────────────────────────────────

export class DrawingPrimitive implements ISeriesPrimitive<Time> {
  _chart: IChartApi | null = null;
  _series: ISeriesApi<'Candlestick'> | null = null;
  _requestUpdate: (() => void) | null = null;
  _drawingsRef: RefObject<Drawing[]>;
  _selectedIdRef: RefObject<string | null>;
  _hoveredIdRef: RefObject<string | null>;
  _cursorVariantRef: RefObject<string | undefined>;
  _inProgressRef: RefObject<InProgressDrawing | null>;
  private _paneView: TrendlinePaneView;
  /** Lazy offscreen canvas 2D context used by `hitTest` to measure annotation
   *  text bounds. Created on first hitTest (browser-only — never SSR). */
  private _measuringCtx: CanvasRenderingContext2D | null = null;

  /** Lazily create or return the cached measuring context. Returns null if
   *  the browser blocks offscreen canvas creation (rare) — caller must
   *  tolerate by skipping box-body hit-test for annotation shapes. */
  private _getMeasuringCtx(): CanvasRenderingContext2D | null {
    if (this._measuringCtx) return this._measuringCtx;
    try {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      if (ctx) {
        this._measuringCtx = ctx;
        return ctx;
      }
    } catch {
      // fall through
    }
    return null;
  }

  constructor(
    drawingsRef: RefObject<Drawing[]>,
    selectedIdRef: RefObject<string | null>,
    hoveredIdRef: RefObject<string | null>,
    cursorVariantRef: RefObject<string | undefined>,
    inProgressRef: RefObject<InProgressDrawing | null>
  ) {
    this._drawingsRef = drawingsRef;
    this._selectedIdRef = selectedIdRef;
    this._hoveredIdRef = hoveredIdRef;
    this._cursorVariantRef = cursorVariantRef;
    this._inProgressRef = inProgressRef;
    this._paneView = new TrendlinePaneView(this);
  }

  attached(param: SeriesAttachedParameter<Time, 'Candlestick'>): void {
    this._chart = param.chart as IChartApi;
    this._series = param.series as ISeriesApi<'Candlestick'>;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) return null;

    const drawings = this._drawingsRef.current;
    let closest: { id: string; dist: number; priority: number; isHandle: boolean } | null = null;

    for (const drawing of drawings) {
      const { type, points } = drawing.shape;

      // ── P6 — text / note / callout / priceNote / priceLabel ──────────
      if (
        type === 'text' ||
        type === 'note' ||
        type === 'callout' ||
        type === 'priceNote' ||
        type === 'priceLabel'
      ) {
        if (points.length < 1) continue;
        const p = points[0];
        const ax = chart.timeScale().timeToCoordinate(p.time);
        const ay = series.priceToCoordinate(p.price);
        if (ax === null || ay === null) continue;

        // Anchor handle hit — priority 2 (above body)
        if (!drawing.isLocked) {
          const handleDist = Math.sqrt((x - ax) ** 2 + (y - ay) ** 2);
          if (handleDist < 12 && (!closest || handleDist < closest.dist)) {
            closest = { id: drawing.id, dist: handleDist, priority: 2, isHandle: true };
          }
        }

        // Body hit — pointInRect on the rendered box
        const mctx = this._getMeasuringCtx();
        if (mctx) {
          const box = computeBox(mctx, drawing, ax, ay);
          if (box && pointInRect(x, y, box.x, box.y, box.w, box.h, 4)) {
            const bodyDist = 0; // inside the box — closest possible
            if (!closest || bodyDist < closest.dist) {
              closest = { id: drawing.id, dist: bodyDist, priority: 1, isHandle: false };
            }
          }
        }

        // Price note — also hit-test the dashed lead line (horizontal Y proximity)
        if (type === 'priceNote') {
          const leadDist = Math.abs(y - ay);
          if (leadDist < 8 && (!closest || leadDist < closest.dist)) {
            closest = { id: drawing.id, dist: leadDist, priority: 1, isHandle: false };
          }
        }
        continue;
      }

      if (type === 'horizontal' && points.length >= 1) {
        const p = points[0];
        const yLine = series.priceToCoordinate(p.price);
        if (yLine === null) continue;

        if (!drawing.isLocked) {
          const xHandle = chart.timeScale().timeToCoordinate(p.time);
          if (xHandle !== null) {
            const dist = Math.sqrt((x - xHandle) ** 2 + (y - yLine) ** 2);
            if (dist < 12 && (!closest || dist < closest.dist)) {
              closest = { id: drawing.id, dist, priority: 2, isHandle: true };
            }
          }
        }

        const bodyDist = Math.abs(y - yLine);
        if (bodyDist < 8 && (!closest || bodyDist < closest.dist)) {
          closest = { id: drawing.id, dist: bodyDist, priority: 1, isHandle: false };
        }
        continue;
      }

      if (type === 'vertical' && points.length >= 1) {
        const p = points[0];
        const xLine = chart.timeScale().timeToCoordinate(p.time);
        if (xLine === null) continue;

        if (!drawing.isLocked) {
          const yHandle = series.priceToCoordinate(p.price);
          if (yHandle !== null) {
            const dist = Math.sqrt((x - xLine) ** 2 + (y - yHandle) ** 2);
            if (dist < 12 && (!closest || dist < closest.dist)) {
              closest = { id: drawing.id, dist, priority: 2, isHandle: true };
            }
          }
        }

        const bodyDist = Math.abs(x - xLine);
        if (bodyDist < 8 && (!closest || bodyDist < closest.dist)) {
          closest = { id: drawing.id, dist: bodyDist, priority: 1, isHandle: false };
        }
        continue;
      }

      if (type === 'trendline' || type === 'ray') {
        if (points.length < 2) continue;
        const p1 = points[0];
        const p2 = points[1];
        const x1 = chart.timeScale().timeToCoordinate(p1.time);
        const y1 = series.priceToCoordinate(p1.price);
        const x2 = chart.timeScale().timeToCoordinate(p2.time);
        const y2 = series.priceToCoordinate(p2.price);
        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

        if (!drawing.isLocked) {
          for (const [hx, hy] of [
            [x1, y1],
            [x2, y2],
          ]) {
            const dist = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
            if (dist < 12 && (!closest || dist < closest.dist)) {
              closest = { id: drawing.id, dist, priority: 2, isHandle: true };
            }
          }
        }

        const bodyDist =
          type === 'ray'
            ? pointToRayDist(x, y, x1, y1, x2, y2)
            : pointToSegmentDist(x, y, x1, y1, x2, y2);
        if (bodyDist < 8 && (!closest || bodyDist < closest.dist)) {
          closest = { id: drawing.id, dist: bodyDist, priority: 1, isHandle: false };
        }
        continue;
      }

      if (type === 'parallel') {
        if (points.length < 3) continue;
        const ax = chart.timeScale().timeToCoordinate(points[0].time);
        const ay = series.priceToCoordinate(points[0].price);
        const bx = chart.timeScale().timeToCoordinate(points[1].time);
        const by = series.priceToCoordinate(points[1].price);
        const cx = chart.timeScale().timeToCoordinate(points[2].time);
        const cy = series.priceToCoordinate(points[2].price);
        if (ax === null || ay === null || bx === null || by === null || cx === null || cy === null)
          continue;

        if (!drawing.isLocked) {
          for (const [hx, hy] of [
            [ax, ay],
            [bx, by],
            [cx, cy],
          ]) {
            const dist = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
            if (dist < 12 && (!closest || dist < closest.dist)) {
              closest = { id: drawing.id, dist, priority: 2, isHandle: true };
            }
          }
        }

        const ddx = bx - ax;
        const ddy = by - ay;
        const baseDist = pointToSegmentDist(x, y, ax, ay, bx, by);
        if (baseDist < 8 && (!closest || baseDist < closest.dist)) {
          closest = { id: drawing.id, dist: baseDist, priority: 1, isHandle: false };
        }
        const offsetDist = pointToSegmentDist(x, y, cx, cy, cx + ddx, cy + ddy);
        if (offsetDist < 8 && (!closest || offsetDist < closest.dist)) {
          closest = { id: drawing.id, dist: offsetDist, priority: 1, isHandle: false };
        }
      }

      if (type === 'polyline') {
        if (points.length < 2) continue;

        if (!drawing.isLocked) {
          for (const p of points) {
            const hx = chart.timeScale().timeToCoordinate(p.time);
            const hy = series.priceToCoordinate(p.price);
            if (hx === null || hy === null) continue;
            const dist = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
            if (dist < 12 && (!closest || dist < closest.dist)) {
              closest = { id: drawing.id, dist, priority: 2, isHandle: true };
            }
          }
        }

        for (let i = 0; i < points.length - 1; i++) {
          const x1 = chart.timeScale().timeToCoordinate(points[i]!.time);
          const y1 = series.priceToCoordinate(points[i]!.price);
          const x2 = chart.timeScale().timeToCoordinate(points[i + 1]!.time);
          const y2 = series.priceToCoordinate(points[i + 1]!.price);
          if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
          const bodyDist = pointToSegmentDist(x, y, x1, y1, x2, y2);
          if (bodyDist < 8 && (!closest || bodyDist < closest.dist)) {
            closest = { id: drawing.id, dist: bodyDist, priority: 1, isHandle: false };
          }
        }
      }
    }

    if (!closest) return null;

    return {
      externalId: closest.id,
      zOrder: 'top',
      distance: closest.dist,
      hitTestPriority: closest.priority,
      cursorStyle: closest.isHandle ? 'grab' : 'pointer',
      itemType: 'primitive',
    };
  }

  requestUpdate(): void {
    this._requestUpdate?.();
  }
}
