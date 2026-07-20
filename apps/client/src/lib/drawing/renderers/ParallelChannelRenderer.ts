// ─── ParallelChannelRenderer — two parallel lines + fill ────────────
//
// Draws a parallel channel: base line A→B and offset line C→C+(B−A).
// The area between the two lines is filled with a translucent tint.
// Hit‑tests against both line bodies and the three anchor handles.

import { HitTarget, type HitTestResult } from '@/lib/drawing/HitTarget';
import { BODY_HIT_TOLERANCE_PX, HANDLE_HIT_TOLERANCE_PX } from '@/lib/drawing/interactionTolerance';
import { pointToSegmentDist, drawHandles, applyLineStyle } from './sharedDrawing';
import { BitmapCoordinatesPaneRenderer, type DrawScope } from './BitmapCoordinatesPaneRenderer';

export interface ChannelLabelData {
  text: string;
  color: string;
  x: number;
  y: number;
  angle: number;
}

export interface ParallelChannelRendererData {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  color: string;
  linewidth: number;
  linestyle: 'solid' | 'dashed' | 'dotted';
  label?: ChannelLabelData;
  handlePositions?: Array<{ x: number; y: number }>;
}

export class ParallelChannelRenderer extends BitmapCoordinatesPaneRenderer {
  private _data: ParallelChannelRendererData | null = null;

  setData(data: ParallelChannelRendererData): void {
    this._data = data;
  }

  draw(scope: DrawScope): void {
    const d = this._data;
    if (!d) return;
    const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;

    const bax = Math.round(d.ax * hpr);
    const bay = Math.round(d.ay * vpr);
    const bbx = Math.round(d.bx * hpr);
    const bby = Math.round(d.by * vpr);
    const bcx = Math.round(d.cx * hpr);
    const bcy = Math.round(d.cy * vpr);
    const bdx = Math.round(d.dx * hpr);
    const bdy = Math.round(d.dy * vpr);

    // Fill between the two lines
    ctx.save();
    ctx.fillStyle = d.color + '20';
    ctx.beginPath();
    ctx.moveTo(bax, bay);
    ctx.lineTo(bbx, bby);
    ctx.lineTo(bdx, bdy);
    ctx.lineTo(bcx, bcy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Base line A→B
    ctx.save();
    applyLineStyle(ctx, d.color, d.linewidth * hpr, d.linestyle, hpr);
    ctx.beginPath();
    ctx.moveTo(bax, bay);
    ctx.lineTo(bbx, bby);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Offset line C→D
    ctx.save();
    applyLineStyle(ctx, d.color, d.linewidth * hpr, d.linestyle, hpr);
    ctx.beginPath();
    ctx.moveTo(bcx, bcy);
    ctx.lineTo(bdx, bdy);
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

    const baseDist = pointToSegmentDist(x, y, d.ax, d.ay, d.bx, d.by);
    if (baseDist < BODY_HIT_TOLERANCE_PX) {
      return { hitTarget: HitTarget.Body, distance: baseDist };
    }

    const offsetDist = pointToSegmentDist(x, y, d.cx, d.cy, d.dx, d.dy);
    if (offsetDist < BODY_HIT_TOLERANCE_PX) {
      return { hitTarget: HitTarget.Body, distance: offsetDist };
    }

    return null;
  }
}
