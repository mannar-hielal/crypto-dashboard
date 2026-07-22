import type { IPrimitivePaneRenderer, IPrimitivePaneView, PrimitivePaneViewZOrder } from 'lightweight-charts';
import { interaction } from '@/lib/tokens';
import { PaneCursorType } from './types';
import type { PaneCursorType as PaneCursorTypeT } from './types';

// Derive canvas target type from IPrimitivePaneRenderer's draw method
// rather than importing fancy-canvas directly (bundled inside lightweight-charts)
type CanvasTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

// ─── Types ────────────────────────────────────────────────────────────────

export interface AnchorPoint {
  x: number;
  y: number;
  pointIndex?: number;
  cursorOverride?: PaneCursorTypeT;
}

export interface AnchorRendererData {
  points: AnchorPoint[];
  selected?: boolean;
  hoveredPointIndex?: number | null;
  color: string;
  /** @default false */
  isTouch?: boolean;
}

// ─── Angle-based cursor computation (TV pattern) ───────────────────────────

const ANGLE_22_5 = Math.PI / 8;
const ANGLE_67_5 = 3 * ANGLE_22_5;
const ANGLE_112_5 = 5 * ANGLE_22_5;
const ANGLE_157_5 = 7 * ANGLE_22_5;
const ANGLE_202_5 = 9 * ANGLE_22_5;
const ANGLE_247_5 = 11 * ANGLE_22_5;
const ANGLE_292_5 = 13 * ANGLE_22_5;
const ANGLE_337_5 = 15 * ANGLE_22_5;

export function cursorResizeFromAngle(
  from: { x: number; y: number },
  to: { x: number; y: number }
): PaneCursorTypeT {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) {
    return PaneCursorType.Default;
  }
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += 2 * Math.PI;

  if (angle >= ANGLE_337_5 || angle < ANGLE_22_5 || (angle >= ANGLE_157_5 && angle < ANGLE_202_5)) {
    return PaneCursorType.HorizontalResize;
  }
  if ((angle >= ANGLE_22_5 && angle < ANGLE_67_5) || (angle >= ANGLE_202_5 && angle < ANGLE_247_5)) {
    return PaneCursorType.DiagonalNwSeResize;
  }
  if ((angle >= ANGLE_67_5 && angle < ANGLE_112_5) || (angle >= ANGLE_247_5 && angle < ANGLE_292_5)) {
    return PaneCursorType.VerticalResize;
  }
  return PaneCursorType.DiagonalNeSwResize;
}

// ─── Renderer ──────────────────────────────────────────────────────────────

class AnchorPaneRenderer implements IPrimitivePaneRenderer {
  private data: AnchorRendererData | null = null;

  setData(data: AnchorRendererData | null): void {
    this.data = data;
  }

  draw(target: CanvasTarget): void {
    if (!this.data) return;

    const { points, selected, hoveredPointIndex, color, isTouch = false } = this.data;
    if (points.length === 0) return;

    const radius = isTouch ? interaction.anchorRadius.touch : interaction.anchorRadius.regular;
    const strokeWidth = isTouch
      ? (selected ? interaction.anchorStroke.touchSelected : interaction.anchorStroke.touch)
      : (selected ? interaction.anchorStroke.selected : interaction.anchorStroke.regular);

    target.useMediaCoordinateSpace(({ context }) => {
      for (const pt of points) {
        const { x, y } = pt;
        const isHovered = hoveredPointIndex != null && pt.pointIndex === hoveredPointIndex;
        const drawRadius = isHovered ? radius + 2 : radius;

        // Outline
        context.beginPath();
        context.arc(x, y, drawRadius, 0, 2 * Math.PI);
        context.strokeStyle = color;
        context.lineWidth = strokeWidth;
        context.stroke();

        // Fill
        context.beginPath();
        context.arc(x, y, drawRadius - strokeWidth, 0, 2 * Math.PI);
        context.fillStyle = isHovered ? color : '#1a1a2e';
        context.fill();
      }
    });
  }
}

// ─── Pane View ──────────────────────────────────────────────────────────────

export class AnchorPaneView implements IPrimitivePaneView {
  private _renderer = new AnchorPaneRenderer();

  update(data: AnchorRendererData | null): void {
    this._renderer.setData(data);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer | null {
    return this._renderer;
  }
}
