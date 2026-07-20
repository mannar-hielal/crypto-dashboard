// ─── HorizontalLineRenderer — full‑width horizontal line ────────────
//
// Draws a horizontal line spanning the full chart width at a single price
// level. Hit‑tests against the infinite line (CSS‑pixel Y proximity).

import { HitTarget, type HitTestResult } from '@/lib/drawing/HitTarget';
import { BODY_HIT_TOLERANCE_PX, HANDLE_HIT_TOLERANCE_PX } from '@/lib/drawing/interactionTolerance';
import { drawHandles, applyLineStyle } from './sharedDrawing';
import { BitmapCoordinatesPaneRenderer, type DrawScope } from './BitmapCoordinatesPaneRenderer';

export interface HorizontalLabelData {
  text: string;
  color: string;
  x: number;
  y: number;
}

export interface HorizontalLineRendererData {
  mediaWidth: number;
  y: number;
  color: string;
  linewidth: number;
  linestyle: 'solid' | 'dashed' | 'dotted';
  label?: HorizontalLabelData;
  handlePositions?: Array<{ x: number; y: number }>;
}

export class HorizontalLineRenderer extends BitmapCoordinatesPaneRenderer {
  private _data: HorizontalLineRendererData | null = null;

  setData(data: HorizontalLineRendererData): void {
    this._data = data;
  }

  draw(scope: DrawScope): void {
    const d = this._data;
    if (!d) return;
    const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
    const by = Math.round(d.y * vpr);
    const bitmapW = scope.bitmapSize.width;

    ctx.save();
    applyLineStyle(ctx, d.color, d.linewidth * hpr, d.linestyle, hpr);
    ctx.beginPath();
    ctx.moveTo(0, by);
    ctx.lineTo(bitmapW, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (d.label) {
      ctx.save();
      ctx.font = `24px "Geist Variable", -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = d.label.color;
      ctx.fillText(d.label.text, Math.round(d.label.x * hpr), by - 8 * vpr);
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

    const bodyDist = Math.abs(y - d.y);
    if (bodyDist < BODY_HIT_TOLERANCE_PX) {
      return { hitTarget: HitTarget.Body, distance: bodyDist };
    }

    return null;
  }
}
