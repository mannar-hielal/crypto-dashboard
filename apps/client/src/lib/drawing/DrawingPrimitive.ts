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
import type { Drawing, InProgressDrawing } from '@/lib/drawing/types';

function pointToSegmentDist(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;
  return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
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
        }

        // ── Committed trendlines ────────────────────────────────
        const drawings = this._primitive._drawingsRef.current;
        const selectedId = this._primitive._selectedIdRef.current;

        for (const drawing of drawings) {
          if (drawing.type !== 'trendline' || drawing.points.length < 2) continue;

          const p1 = drawing.points[0];
          const p2 = drawing.points[1];
          const x1 = chart.timeScale().timeToCoordinate(p1.time);
          const y1 = series.priceToCoordinate(p1.price);
          const x2 = chart.timeScale().timeToCoordinate(p2.time);
          const y2 = series.priceToCoordinate(p2.price);
          if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

          const bx1 = Math.round(x1 * hpr);
          const by1 = Math.round(y1 * vpr);
          const bx2 = Math.round(x2 * hpr);
          const by2 = Math.round(y2 * vpr);

          // Line
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

          ctx.beginPath();
          ctx.moveTo(bx1, by1);
          ctx.lineTo(bx2, by2);
          ctx.stroke();
          ctx.setLineDash([]);

          // ── Label ─────────────────────────────────────────────
          const midBx = (bx1 + bx2) / 2;
          const midBy = (by1 + by2) / 2;

          ctx.save();

          if (drawing.label) {
            const angle = Math.atan2(by2 - by1, bx2 - bx1);
            ctx.translate(midBx, midBy);
            ctx.rotate(angle);
            ctx.font = `24px "Geist Variable", -apple-system, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = drawing.textColor;
            ctx.fillText(drawing.label, 0, -8 * vpr);
          }

          ctx.restore();

          // ── Handles (if selected) ──────────────────────────────
          const isSelected = drawing.id === selectedId;
          if (isSelected) {
            const handleR = Math.round(6 * hpr);
            const strokeW = Math.round(2 * hpr);

            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = drawing.color;
            ctx.lineWidth = strokeW;

            for (const [hx, hy] of [
              [bx1, by1],
              [bx2, by2],
            ]) {
              ctx.beginPath();
              ctx.arc(hx, hy, handleR, 0, 2 * Math.PI);
              ctx.fill();
              ctx.stroke();
            }

            ctx.restore();
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
  _inProgressRef: RefObject<InProgressDrawing | null>;
  private _paneView: TrendlinePaneView;

  constructor(
    drawingsRef: RefObject<Drawing[]>,
    selectedIdRef: RefObject<string | null>,
    inProgressRef: RefObject<InProgressDrawing | null>
  ) {
    this._drawingsRef = drawingsRef;
    this._selectedIdRef = selectedIdRef;
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
      if (drawing.type !== 'trendline' || drawing.points.length < 2) continue;

      const p1 = drawing.points[0];
      const p2 = drawing.points[1];
      const x1 = chart.timeScale().timeToCoordinate(p1.time);
      const y1 = series.priceToCoordinate(p1.price);
      const x2 = chart.timeScale().timeToCoordinate(p2.time);
      const y2 = series.priceToCoordinate(p2.price);
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

      // Locked drawings: only line-body hits (selection), no handle hits
      if (!drawing.isLocked) {
        // Endpoint handles (priority 2, 12px threshold)
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

      // Line body (priority 1, 8px threshold) — always hit-testable
      const lineDist = pointToSegmentDist(x, y, x1, y1, x2, y2);
      if (lineDist < 8 && (!closest || lineDist < closest.dist)) {
        closest = { id: drawing.id, dist: lineDist, priority: 1, isHandle: false };
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
