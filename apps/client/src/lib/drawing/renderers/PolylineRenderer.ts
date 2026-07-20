// ─── PolylineRenderer — N‑point connected segments ─────────────────
//
// Draws a polyline (N ≥ 2 connected straight segments). Hit‑tests each
// segment independently so the user can click any part of the chain.

import { HitTarget, type HitTestResult } from '@/lib/drawing/HitTarget';
import { BODY_HIT_TOLERANCE_PX, HANDLE_HIT_TOLERANCE_PX } from '@/lib/drawing/interactionTolerance';
import { pointToSegmentDist, drawHandles, applyLineStyle } from './sharedDrawing';
import { BitmapCoordinatesPaneRenderer, type DrawScope } from './BitmapCoordinatesPaneRenderer';

export interface PolylineLabelData {
  text: string;
  color: string;
  x: number;
  y: number;
  angle: number;
}

export interface PolylineRendererData {
  points: Array<{ x: number; y: number }>;
  color: string;
  linewidth: number;
  linestyle: 'solid' | 'dashed' | 'dotted';
  label?: PolylineLabelData;
  handlePositions?: Array<{ x: number; y: number }>;
}

export class PolylineRenderer extends BitmapCoordinatesPaneRenderer {
  private _data: PolylineRendererData | null = null;

  setData(data: PolylineRendererData): void {
    this._data = data;
  }

  draw(scope: DrawScope): void {
    const d = this._data;
    if (!d || d.points.length < 2) return;
    const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;

    const bps = d.points.map((p) => ({
      x: Math.round(p.x * hpr),
      y: Math.round(p.y * vpr),
    }));

    ctx.save();
    applyLineStyle(ctx, d.color, d.linewidth * hpr, d.linestyle, hpr);
    ctx.beginPath();
    ctx.moveTo(bps[0].x, bps[0].y);
    for (let i = 1; i < bps.length; i++) {
      ctx.lineTo(bps[i].x, bps[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (d.label && bps.length >= 2) {
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
    if (!d || d.points.length < 2) return null;

    if (d.handlePositions) {
      for (const hp of d.handlePositions) {
        const dist = Math.sqrt((x - hp.x) ** 2 + (y - hp.y) ** 2);
        if (dist < HANDLE_HIT_TOLERANCE_PX) {
          return { hitTarget: HitTarget.Handle, distance: dist };
        }
      }
    }

    for (let i = 0; i < d.points.length - 1; i++) {
      const dist = pointToSegmentDist(
        x,
        y,
        d.points[i].x,
        d.points[i].y,
        d.points[i + 1].x,
        d.points[i + 1].y
      );
      if (dist < BODY_HIT_TOLERANCE_PX) {
        return { hitTarget: HitTarget.Body, distance: dist };
      }
    }

    return null;
  }
}
