// ─── TrendLineRenderer — trendline / ray / extended line ───────────
//
// Matches the TradingView pattern (module 664815 in the extracted chunks):
// draws a line segment with optional ray extension, optional label, and
// optional selection handles. Both trendline (segment, t∈[0,1]) and ray
// (t∈[0,∞)) share this renderer — the `extendRight` flag controls whether
// the line extends infinitely past point B.

import { HitTarget, type HitTestResult } from '@/lib/drawing/HitTarget';
import { BODY_HIT_TOLERANCE_PX, HANDLE_HIT_TOLERANCE_PX } from '@/lib/drawing/interactionTolerance';
import { pointToSegmentDist, pointToRayDist, drawHandles, applyLineStyle } from './sharedDrawing';
import { BitmapCoordinatesPaneRenderer, type DrawScope } from './BitmapCoordinatesPaneRenderer';

export interface Point {
  x: number;
  y: number;
}

export interface TrendLineLabelData {
  text: string;
  color: string;
  x: number;
  y: number;
  angle: number;
}

export interface TrendLineRendererData {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  linewidth: number;
  linestyle: 'solid' | 'dashed' | 'dotted';
  extendRight: boolean;
  label?: TrendLineLabelData;
  handlePositions?: Point[];
}

export class TrendLineRenderer extends BitmapCoordinatesPaneRenderer {
  private _data: TrendLineRendererData | null = null;

  setData(data: TrendLineRendererData): void {
    this._data = data;
  }

  draw(scope: DrawScope): void {
    const d = this._data;
    if (!d) return;
    const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
    let endX = d.x2;
    let endY = d.y2;

    if (d.extendRight) {
      const dx = d.x2 - d.x1;
      const dy = d.y2 - d.y1;
      const mediaW = scope.mediaSize.width;
      const mediaH = scope.mediaSize.height;
      let t: number;
      if (dx > 0) {
        t = (mediaW - d.x1) / dx;
      } else if (dx < 0) {
        t = -d.x1 / dx;
      } else if (dy > 0) {
        t = (mediaH - d.y1) / dy;
      } else if (dy < 0) {
        t = -d.y1 / dy;
      } else {
        t = 1;
      }
      const clamped = Math.max(1, t);
      endX = d.x1 + clamped * dx;
      endY = d.y1 + clamped * dy;
    }

    const bx1 = Math.round(d.x1 * hpr);
    const by1 = Math.round(d.y1 * vpr);
    const bx2 = Math.round(endX * hpr);
    const by2 = Math.round(endY * vpr);

    ctx.save();
    applyLineStyle(ctx, d.color, d.linewidth * hpr, d.linestyle, hpr);
    ctx.beginPath();
    ctx.moveTo(bx1, by1);
    ctx.lineTo(bx2, by2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (d.label) {
      ctx.save();
      ctx.translate(Math.round(d.label.x * hpr), Math.round(d.label.y * vpr));
      ctx.rotate(d.label.angle);
      ctx.font = `24px "Geist Variable", -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = d.label.color;
      ctx.fillText(d.label.text, 0, -8 * vpr);
      ctx.restore();
    }

    if (d.handlePositions && d.handlePositions.length > 0) {
      drawHandles(ctx, hpr, vpr, d.handlePositions, d.color);
    }
  }

  hitTest(x: number, y: number): HitTestResult | null {
    const d = this._data;
    if (!d) return null;

    if (d.handlePositions) {
      for (const hp of d.handlePositions) {
        const dist = Math.sqrt((x - hp.x) ** 2 + (y - hp.y) ** 2);
        if (dist < HANDLE_HIT_TOLERANCE_PX) {
          return { hitTarget: HitTarget.Handle, distance: dist };
        }
      }
    }

    const dist = d.extendRight
      ? pointToRayDist(x, y, d.x1, d.y1, d.x2, d.y2)
      : pointToSegmentDist(x, y, d.x1, d.y1, d.x2, d.y2);

    if (dist < BODY_HIT_TOLERANCE_PX) {
      return { hitTarget: HitTarget.Body, distance: dist };
    }

    return null;
  }
}
