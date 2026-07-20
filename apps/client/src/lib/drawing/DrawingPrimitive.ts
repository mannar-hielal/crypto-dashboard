// ─── DrawingPrimitive — ISeriesPrimitive with per-shape renderers ──
//
// Rewritten (Phase 1) to use per-shape BitmapCoordinatesPaneRenderer
// classes via CompositeRenderer instead of a monolithic switch. This
// layer handles:
//   1. Chart-→CSS-pixel coordinate conversion
//   2. Composite composition (one renderer per drawing)
//   3. In-progress preview (direct canvas)
//   4. Hit-test delegation to composite

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
import type { Drawing, InProgressDrawing, PaneIndex } from '@/lib/drawing/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { HitTarget } from '@/lib/drawing/HitTarget';
import { formatPriceLabel } from '@/lib/drawing/textLayout';
import {
  CompositeRenderer,
  TrendLineRenderer,
  HorizontalLineRenderer,
  VerticalLineRenderer,
  ParallelChannelRenderer,
  PolylineRenderer,
  TextLabelRenderer,
  type BitmapCoordinatesPaneRenderer,
  type TextLabelShapeType,
  type DrawScope,
  type Point,
} from '@/lib/drawing/renderers';

// ─── Internal pane renderer — draws composite + in-progress ─────────

class DrawingPaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: DrawingPrimitive;

  constructor(primitive: DrawingPrimitive) {
    this._primitive = primitive;
  }

  draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]) {
    target.useBitmapCoordinateSpace((scope: DrawScope) => {
      const p = this._primitive;
      const chart = p._chart;
      const series = p._series;
      if (!chart || !series) return;

      p._drawInProgressPreview(scope, chart, series);
      p._buildComposite(chart, series);
      p._composite.draw(scope);
    });
  }
}

// ─── Internal pane view — returns the drawing pane renderer ─────────

class DrawingPaneView implements IPrimitivePaneView {
  private _renderer: DrawingPaneRenderer;

  constructor(primitive: DrawingPrimitive) {
    this._renderer = new DrawingPaneRenderer(primitive);
  }

  zOrder() {
    return 'top' as const;
  }

  renderer(): IPrimitivePaneRenderer | null {
    return this._renderer;
  }
}

// ─── DrawingPrimitive (main) ────────────────────────────────────────

export class DrawingPrimitive implements ISeriesPrimitive<Time> {
  _chart: IChartApi | null = null;
  _series: ISeriesApi<'Candlestick'> | null = null;
  _requestUpdate: (() => void) | null = null;
  _drawingsRef: RefObject<Drawing[]>;
  _selectedIdRef: RefObject<string | null>;
  _hoveredIdRef: RefObject<string | null>;
  _cursorVariantRef: RefObject<string | undefined>;
  _inProgressRef: RefObject<InProgressDrawing | null>;
  _paneIndexRef: RefObject<PaneIndex>;

  private _paneView: DrawingPaneView;
  _composite = new CompositeRenderer();
  _rendererToDrawing: Map<unknown, string> = new Map();
  constructor(
    drawingsRef: RefObject<Drawing[]>,
    selectedIdRef: RefObject<string | null>,
    hoveredIdRef: RefObject<string | null>,
    cursorVariantRef: RefObject<string | undefined>,
    inProgressRef: RefObject<InProgressDrawing | null>,
    paneIndexRef: RefObject<PaneIndex>
  ) {
    this._drawingsRef = drawingsRef;
    this._selectedIdRef = selectedIdRef;
    this._hoveredIdRef = hoveredIdRef;
    this._cursorVariantRef = cursorVariantRef;
    this._inProgressRef = inProgressRef;
    this._paneIndexRef = paneIndexRef;
    this._paneView = new DrawingPaneView(this);
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

  // ─── In-progress preview (direct canvas drawing) ──────────────────

  _drawInProgressPreview(
    scope: DrawScope,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>
  ): void {
    const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
    const ip = this._inProgressRef.current;
    if (!ip || !ip.hoverPoint) return;

    const timeToX = (t: UTCTimestamp) => chart.timeScale().timeToCoordinate(t);
    const priceToY = (p: number) => series.priceToCoordinate(p);

    if (ip.points.length === 1 && ip.hoverPoint) {
      // 2-click tools (trendline, ray): A placed, preview A→cursor
      const x1 = timeToX(ip.points[0].time);
      const y1 = priceToY(ip.points[0].price);
      const x2 = timeToX(ip.hoverPoint.time);
      const y2 = priceToY(ip.hoverPoint.price);
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
    } else if (ip.type === 'parallel' && ip.points.length === 2 && ip.hoverPoint) {
      // 3-click parallel: A & B placed, preview A→B solid + dashed C(hover)→C+(B−A)
      const ax = timeToX(ip.points[0].time);
      const ay = priceToY(ip.points[0].price);
      const bx = timeToX(ip.points[1].time);
      const by = priceToY(ip.points[1].price);
      const cx = timeToX(ip.hoverPoint.time);
      const cy = priceToY(ip.hoverPoint.price);
      if (ax !== null && ay !== null && bx !== null && by !== null && cx !== null && cy !== null) {
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
    } else if (ip.type === 'polyline' && ip.points.length >= 1 && ip.hoverPoint) {
      // Polyline: placed segments solid + dashed segment to cursor
      const placed: Array<{ x: number; y: number }> = [];
      let allValid = true;
      for (const p of ip.points) {
        const px = timeToX(p.time);
        const py = priceToY(p.price);
        if (px === null || py === null) {
          allValid = false;
          break;
        }
        placed.push({ x: Math.round(px * hpr), y: Math.round(py * vpr) });
      }
      const hx = timeToX(ip.hoverPoint.time);
      const hy = priceToY(ip.hoverPoint.price);
      if (allValid && hx !== null && hy !== null) {
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
        const last = placed[placed.length - 1]!;
        ctx.save();
        ctx.setLineDash([6 * hpr, 3 * hpr]);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1 * hpr;
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(Math.round(hx * hpr), Math.round(hy * vpr));
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ─── Build composite from committed drawings ──────────────────────

  _buildComposite(chart: IChartApi, series: ISeriesApi<'Candlestick'>): void {
    this._composite.clear();
    this._rendererToDrawing.clear();

    const drawings = this._drawingsRef.current;
    const paneIndex = this._paneIndexRef.current;
    const selectedId = this._selectedIdRef.current;
    const hoveredId = this._hoveredIdRef.current;
    const isEraser = this._cursorVariantRef.current === 'eraser';

    for (const drawing of drawings) {
      if (drawing.paneIndex !== paneIndex) continue;

      const isSelected = drawing.id === selectedId || (isEraser && drawing.id === hoveredId);

      const renderer = this._createRenderer(drawing, chart, series, isSelected);
      if (renderer) {
        this._composite.append(renderer);
        this._rendererToDrawing.set(renderer, drawing.id);
      }
    }
  }

  // ─── Per-shape renderer creation ──────────────────────────────────

  private _createRenderer(
    drawing: Drawing,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    isSelected: boolean
  ): BitmapCoordinatesPaneRenderer | null {
    switch (drawing.shape.type) {
      case 'trendline':
      case 'ray':
        return this._createTrendLineRenderer(drawing, chart, series, isSelected);
      case 'horizontal':
        return this._createHorizontalRenderer(drawing, chart, series, isSelected);
      case 'vertical':
        return this._createVerticalRenderer(drawing, chart, series, isSelected);
      case 'parallel':
        return this._createParallelRenderer(drawing, chart, series, isSelected);
      case 'polyline':
        return this._createPolylineRenderer(drawing, chart, series, isSelected);
      case 'text':
      case 'note':
      case 'callout':
      case 'priceNote':
      case 'priceLabel':
        return this._createTextLabelRenderer(drawing, chart, series, isSelected);
    }
  }

  private _x(chart: IChartApi, t: UTCTimestamp): number | null {
    return chart.timeScale().timeToCoordinate(t);
  }

  private _y(series: ISeriesApi<'Candlestick'>, p: number): number | null {
    return series.priceToCoordinate(p);
  }

  private _createTrendLineRenderer(
    drawing: Drawing,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    isSelected: boolean
  ): TrendLineRenderer | null {
    const pts = drawing.shape.points;
    if (pts.length < 2) return null;
    const x1 = this._x(chart, pts[0].time);
    const y1 = this._y(series, pts[0].price);
    const x2 = this._x(chart, pts[1].time);
    const y2 = this._y(series, pts[1].price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

    const r = new TrendLineRenderer();
    r.setData({
      x1,
      y1,
      x2,
      y2,
      color: drawing.color,
      linewidth: drawing.lineWidth,
      linestyle: drawing.lineStyle,
      extendRight: drawing.shape.type === 'ray',
      label: drawing.label
        ? {
            text: drawing.label,
            color: drawing.textColor,
            x: (x1 + x2) / 2,
            y: (y1 + y2) / 2,
            angle: Math.atan2(y2 - y1, x2 - x1),
          }
        : undefined,
      handlePositions: isSelected
        ? [
            { x: x1, y: y1 },
            { x: x2, y: y2 },
          ]
        : undefined,
    });
    return r;
  }

  private _createHorizontalRenderer(
    drawing: Drawing,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    isSelected: boolean
  ): HorizontalLineRenderer | null {
    const pts = drawing.shape.points;
    if (pts.length < 1) return null;
    const y = this._y(series, pts[0].price);
    if (y === null) return null;

    const x = this._x(chart, pts[0].time);

    const r = new HorizontalLineRenderer();
    r.setData({
      mediaWidth: 0, // set during draw via scope
      y,
      color: drawing.color,
      linewidth: drawing.lineWidth,
      linestyle: drawing.lineStyle,
      label:
        drawing.label && x !== null
          ? { text: drawing.label, color: drawing.textColor, x, y }
          : undefined,
      handlePositions: isSelected && x !== null ? [{ x, y }] : undefined,
    });
    return r;
  }

  private _createVerticalRenderer(
    drawing: Drawing,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    isSelected: boolean
  ): VerticalLineRenderer | null {
    const pts = drawing.shape.points;
    if (pts.length < 1) return null;
    const x = this._x(chart, pts[0].time);
    if (x === null) return null;

    const y = this._y(series, pts[0].price);

    const r = new VerticalLineRenderer();
    r.setData({
      mediaHeight: 0, // set during draw via scope
      x,
      color: drawing.color,
      linewidth: drawing.lineWidth,
      linestyle: drawing.lineStyle,
      label:
        drawing.label && y !== null
          ? { text: drawing.label, color: drawing.textColor, x, y }
          : undefined,
      handlePositions: isSelected && y !== null ? [{ x, y }] : undefined,
    });
    return r;
  }

  private _createParallelRenderer(
    drawing: Drawing,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    isSelected: boolean
  ): ParallelChannelRenderer | null {
    const pts = drawing.shape.points;
    if (pts.length < 3) return null;
    const ax = this._x(chart, pts[0].time);
    const ay = this._y(series, pts[0].price);
    const bx = this._x(chart, pts[1].time);
    const by = this._y(series, pts[1].price);
    const cx = this._x(chart, pts[2].time);
    const cy = this._y(series, pts[2].price);
    if (ax === null || ay === null || bx === null || by === null || cx === null || cy === null) {
      return null;
    }

    const dx = bx - ax;
    const dy = by - ay;

    const r = new ParallelChannelRenderer();
    r.setData({
      ax,
      ay,
      bx,
      by,
      cx,
      cy,
      dx: cx + dx,
      dy: cy + dy,
      color: drawing.color,
      linewidth: drawing.lineWidth,
      linestyle: drawing.lineStyle,
      label: drawing.label
        ? {
            text: drawing.label,
            color: drawing.textColor,
            x: (ax + bx) / 2,
            y: (ay + by) / 2,
            angle: Math.atan2(by - ay, bx - ax),
          }
        : undefined,
      handlePositions: isSelected
        ? [
            { x: ax, y: ay },
            { x: bx, y: by },
            { x: cx, y: cy },
          ]
        : undefined,
    });
    return r;
  }

  private _createPolylineRenderer(
    drawing: Drawing,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    isSelected: boolean
  ): PolylineRenderer | null {
    const pts = drawing.shape.points;
    if (pts.length < 2) return null;

    const cssPts: Point[] = [];
    for (const p of pts) {
      const x = this._x(chart, p.time);
      const y = this._y(series, p.price);
      if (x === null || y === null) return null;
      cssPts.push({ x, y });
    }

    const r = new PolylineRenderer();
    r.setData({
      points: cssPts,
      color: drawing.color,
      linewidth: drawing.lineWidth,
      linestyle: drawing.lineStyle,
      label:
        drawing.label && cssPts.length >= 2
          ? {
              text: drawing.label,
              color: drawing.textColor,
              x: (cssPts[0].x + cssPts[1].x) / 2,
              y: (cssPts[0].y + cssPts[1].y) / 2,
              angle: Math.atan2(cssPts[1].y - cssPts[0].y, cssPts[1].x - cssPts[0].x),
            }
          : undefined,
      handlePositions: isSelected ? cssPts : undefined,
    });
    return r;
  }

  private _createTextLabelRenderer(
    drawing: Drawing,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    isSelected: boolean
  ): TextLabelRenderer | null {
    const pts = drawing.shape.points;
    if (pts.length < 1) return null;
    const p = pts[0];
    const ax = this._x(chart, p.time);
    const ay = this._y(series, p.price);
    if (ax === null || ay === null) return null;

    const r = new TextLabelRenderer();
    r.setData({
      type: drawing.shape.type as TextLabelShapeType,
      anchorX: ax,
      anchorY: ay,
      label: drawing.label,
      color: drawing.color,
      textColor: drawing.textColor,
      backgroundColor: drawing.backgroundColor,
      fontSize: drawing.fontSize,
      linewidth: drawing.lineWidth,
      linestyle: drawing.lineStyle,
      priceText:
        drawing.shape.type === 'priceNote' || drawing.shape.type === 'priceLabel'
          ? formatPriceLabel(p.price)
          : undefined,
      handlePositions: isSelected ? [{ x: ax, y: ay }] : undefined,
      isSelected,
    });
    return r;
  }

  // ─── Hit-testing ──────────────────────────────────────────────────

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) return null;

    this._buildComposite(chart, series);

    const result = this._composite.hitTest(x, y);
    if (!result) return null;

    const drawingId = this._rendererToDrawing.get(result.renderer);
    if (!drawingId) return null;

    return {
      externalId: drawingId,
      zOrder: 'top',
      distance: result.result.distance,
      hitTestPriority: result.result.hitTarget === HitTarget.Handle ? 2 : 1,
      cursorStyle: result.result.hitTarget === HitTarget.Handle ? 'grab' : 'pointer',
      itemType: 'primitive',
    };
  }

  requestUpdate(): void {
    this._requestUpdate?.();
  }
}
