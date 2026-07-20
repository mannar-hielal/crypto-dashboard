// ─── VerticalLineRenderer — full‑height vertical line ──────────────
//
// Draws a vertical line spanning the full chart height at a single time
// level. Hit‑tests against the infinite line (CSS‑pixel X proximity).

import { HitTarget, type HitTestResult } from '@/lib/drawing/HitTarget';
import { BODY_HIT_TOLERANCE_PX, HANDLE_HIT_TOLERANCE_PX } from '@/lib/drawing/interactionTolerance';
import { drawHandles, applyLineStyle } from './sharedDrawing';
import { BitmapCoordinatesPaneRenderer, type DrawScope } from './BitmapCoordinatesPaneRenderer';

export interface VerticalLabelData {
  text: string;
  color: string;
  x: number;
  y: number;
}

export interface VerticalLineRendererData {
  mediaHeight: number;
  x: number;
  color: string;
  linewidth: number;
  linestyle: 'solid' | 'dashed' | 'dotted';
  label?: VerticalLabelData;
  handlePositions?: Array<{ x: number; y: number }>;
}

export class VerticalLineRenderer extends BitmapCoordinatesPaneRenderer {
  private _data: VerticalLineRendererData | null = null;

  setData(data: VerticalLineRendererData): void {
    this._data = data;
  }

  draw(scope: DrawScope): void {
    const d = this._data;
    if (!d) return;
    const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
    const bx = Math.round(d.x * hpr);
    const bitmapH = scope.bitmapSize.height;

    ctx.save();
    applyLineStyle(ctx, d.color, d.linewidth * hpr, d.linestyle, hpr);
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.lineTo(bx, bitmapH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (d.label) {
      ctx.save();
      ctx.translate(bx, Math.round(d.label.y * vpr));
      ctx.rotate(Math.PI / 2);
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

    const bodyDist = Math.abs(x - d.x);
    if (bodyDist < BODY_HIT_TOLERANCE_PX) {
      return { hitTarget: HitTarget.Body, distance: bodyDist };
    }

    return null;
  }
}
