// ─── TextLabelRenderer — text / note / callout / priceNote / priceLabel ─
//
// Renders all five single‑anchor annotation shapes. Each variant shares
// the same anchor‑point geometry but differs in box style, leader lines,
// and price‑pill extras. Hit‑test checks anchor handle, then the expanded
// annotation box (using the same TEXT_HIT_* constants so the click‑target
// matches what the textarea editor and spawn‑guard see).

import { HitTarget, type HitTestResult } from '@/lib/drawing/HitTarget';
import { BODY_HIT_TOLERANCE_PX, HANDLE_HIT_TOLERANCE_PX } from '@/lib/drawing/interactionTolerance';
import { TEXT_HIT_PADDING_PX, TEXT_HIT_MIN_W, TEXT_HIT_MIN_H } from '@/lib/drawing/coordinates';
import { pointInRect } from '@/lib/drawing/coordinates';
import { drawHandles } from './sharedDrawing';
import {
  BOX_PADDING_PX,
  BOX_RADIUS_PX,
  PILL_RADIUS_PX,
  FONT_FAMILY,
  splitLines,
  formatPriceLabel,
  computeAnnotationBox,
  getSharedMeasuringCtx,
} from '@/lib/drawing/textLayout';
import { BitmapCoordinatesPaneRenderer, type DrawScope } from './BitmapCoordinatesPaneRenderer';

export type TextLabelShapeType = 'text' | 'note' | 'callout' | 'priceNote' | 'priceLabel';

const SELECTION_COLOR = '#2962ff';

export interface TextLabelRendererData {
  type: TextLabelShapeType;
  anchorX: number;
  anchorY: number;
  label: string | undefined;
  color: string;
  textColor: string;
  backgroundColor: string;
  fontSize: number;
  linewidth: number;
  linestyle: 'solid' | 'dashed' | 'dotted';
  priceText?: string;
  handlePositions?: Array<{ x: number; y: number }>;
  isSelected?: boolean;
}

export class TextLabelRenderer extends BitmapCoordinatesPaneRenderer {
  private _data: TextLabelRendererData | null = null;
  private _cachedBox: { x: number; y: number; w: number; h: number } | null = null;

  setData(data: TextLabelRendererData): void {
    this._data = data;
    this._cachedBox = null;
  }

  private _computeBox(
    ctx: CanvasRenderingContext2D
  ): { x: number; y: number; w: number; h: number } | null {
    const d = this._data;
    if (!d) return null;
    return computeAnnotationBox(
      ctx,
      {
        label: d.label,
        fontSize: d.fontSize,
        shape: { type: d.type },
      },
      d.anchorX,
      d.anchorY
    );
  }

  draw(scope: DrawScope): void {
    const d = this._data;
    if (!d) return;
    const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;

    // Use shared measuring context so the text box is always sized with the
    // same font metrics the TextDrawingEditor uses — eliminating the visible
    // size jump between textarea editing and canvas rendering.
    const measuringCtx = getSharedMeasuringCtx(d.fontSize) ?? ctx;
    const box = this._computeBox(measuringCtx);
    if (!box) return;
    this._cachedBox = box;

    const bX = Math.round(box.x * hpr);
    const bY = Math.round(box.y * vpr);
    const bW = Math.round(box.w * hpr);
    const bH = Math.round(box.h * vpr);
    const padding = d.type === 'text' ? 1 : BOX_PADDING_PX;

    const renderLabel = (fill: string) => {
      const lines = splitLines(d.label);
      const lineH = Math.round(d.fontSize * 1.2);
      const blockH = lineH * Math.max(1, lines.length);
      ctx.save();
      ctx.font = `${d.fontSize}px ${FONT_FAMILY}`;
      ctx.fillStyle = fill;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const startY = box.y + (box.h - blockH) / 2;
      for (let i = 0; i < lines.length; i++) {
        const y = startY + i * lineH;
        ctx.fillText(lines[i]!, Math.round((box.x + padding) * hpr), Math.round(y * vpr));
      }
      ctx.restore();
    };

    switch (d.type) {
      case 'text': {
        renderLabel(d.textColor);
        break;
      }
      case 'note':
      case 'priceNote': {
        ctx.save();
        roundRectPath(ctx, bX, bY, bW, bH, BOX_RADIUS_PX * hpr);
        ctx.fillStyle = d.backgroundColor;
        ctx.fill();
        ctx.lineWidth = d.linewidth * hpr;
        ctx.strokeStyle = d.color;
        ctx.stroke();
        ctx.restore();

        renderLabel(d.textColor);

        ctx.save();
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(
          Math.round(d.anchorX * hpr),
          Math.round(d.anchorY * vpr),
          Math.round(3 * hpr),
          0,
          2 * Math.PI
        );
        ctx.fill();
        ctx.restore();

        if (d.type === 'priceNote') {
          const pillXCss = scope.mediaSize.width - 60;
          ctx.save();
          ctx.setLineDash([6 * hpr, 3 * hpr]);
          ctx.strokeStyle = d.color + '90';
          ctx.lineWidth = d.linewidth * hpr;
          ctx.beginPath();
          ctx.moveTo(bX + bW, Math.round(d.anchorY * vpr));
          ctx.lineTo(Math.round(pillXCss * hpr), Math.round(d.anchorY * vpr));
          ctx.stroke();
          ctx.restore();

          renderPricePill(
            ctx,
            hpr,
            vpr,
            pillXCss,
            d.anchorY,
            d.priceText ?? formatPriceLabel(0),
            d.color,
            d.textColor,
            d.fontSize
          );
        }
        break;
      }
      case 'callout': {
        ctx.save();
        ctx.strokeStyle = d.color;
        ctx.lineWidth = d.linewidth * hpr;
        ctx.beginPath();
        ctx.moveTo(Math.round(d.anchorX * hpr), Math.round(d.anchorY * vpr));
        ctx.lineTo(Math.round((box.x + box.w / 2) * hpr), Math.round((box.y + box.h) * vpr));
        ctx.stroke();
        ctx.restore();

        ctx.save();
        roundRectPath(ctx, bX, bY, bW, bH, BOX_RADIUS_PX * hpr);
        ctx.fillStyle = d.backgroundColor;
        ctx.fill();
        ctx.lineWidth = d.linewidth * hpr;
        ctx.strokeStyle = d.color;
        ctx.stroke();
        ctx.restore();

        renderLabel(d.textColor);
        break;
      }
      case 'priceLabel': {
        renderPricePill(
          ctx,
          hpr,
          vpr,
          d.anchorX,
          d.anchorY,
          d.priceText ?? formatPriceLabel(0),
          d.color,
          d.textColor,
          d.fontSize
        );
        break;
      }
    }

    if (d.handlePositions && d.handlePositions.length > 0) {
      drawHandles(ctx, hpr, vpr, d.handlePositions, d.color);
    }

    if (d.isSelected) {
      const selPad = d.type === 'text' ? -2 : BOX_PADDING_PX;
      ctx.save();
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 2 * hpr;
      ctx.setLineDash([]);
      roundRectPath(
        ctx,
        bX - selPad * hpr,
        bY - selPad * vpr,
        bW + selPad * 2 * hpr,
        bH + selPad * 2 * vpr,
        (d.type === 'text' ? 2 : BOX_RADIUS_PX) * hpr
      );
      ctx.stroke();
      ctx.restore();
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

    const box = this._cachedBox;
    if (!box) return null;

    const hitW = Math.max(box.w, TEXT_HIT_MIN_W);
    const hitH = Math.max(box.h, TEXT_HIT_MIN_H);
    if (pointInRect(x, y, box.x, box.y, hitW, hitH, TEXT_HIT_PADDING_PX)) {
      return { hitTarget: HitTarget.Body, distance: 0 };
    }

    if (d.type === 'priceNote') {
      const leadDist = Math.abs(y - d.anchorY);
      if (leadDist < BODY_HIT_TOLERANCE_PX) {
        return { hitTarget: HitTarget.Body, distance: leadDist };
      }
    }

    return null;
  }
}

// ─── Helper: rounded rect path (no save/restore) ─────────────────────

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

// ─── Helper: price pill ──────────────────────────────────────────────

function renderPricePill(
  ctx: CanvasRenderingContext2D,
  hpr: number,
  vpr: number,
  cx: number,
  cy: number,
  priceText: string,
  fill: string,
  textColor: string,
  fontSize: number
) {
  const paddingCss = 8;
  const radiusCss = PILL_RADIUS_PX;
  ctx.save();
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  // fallback — the actual price text is overridden later
  const textW = ctx.measureText(priceText).width;
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
    ctx.moveTo(px - pw / 2 + r, py - ph / 2);
    ctx.arcTo(px + pw / 2, py - ph / 2, px + pw / 2, py + ph / 2, r);
    ctx.arcTo(px + pw / 2, py + ph / 2, px - pw / 2, py + ph / 2, r);
    ctx.arcTo(px - pw / 2, py + ph / 2, px - pw / 2, py - ph / 2, r);
    ctx.arcTo(px - pw / 2, py - pw / 2, px + pw / 2, py - ph / 2, r);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(priceText, px, py);
  ctx.restore();
}
