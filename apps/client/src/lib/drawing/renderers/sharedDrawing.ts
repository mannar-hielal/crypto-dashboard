// ─── Shared drawing utilities for per‑shape renderers ─────────────
//
// Pure canvas helpers extracted from the old DrawingPrimitive inline
// functions. Every per‑shape renderer draws handle circles via
// `drawHandles()` and applies stroke style via `applyLineStyle()`.
//
// Coordinate math helpers (`pointToSegmentDist`, `pointToRayDist`)
// are re‑exported from `coordinates.ts` so renderers have a single
// import path for both canvas‑ops and geometry.

import type { Point } from './TrendLineRenderer';
export type { Point } from './TrendLineRenderer';

export { pointToSegmentDist, pointToRayDist } from '@/lib/drawing/coordinates';

/**
 * Applies stroke style + dash pattern to a canvas context.
 * Does NOT call save/restore — the caller is responsible.
 */
export function applyLineStyle(
  ctx: CanvasRenderingContext2D,
  color: string,
  lineWidth: number,
  linestyle: 'solid' | 'dashed' | 'dotted',
  hpr: number
): void {
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  if (linestyle === 'dashed') {
    ctx.setLineDash([8 * hpr, 4 * hpr]);
  } else if (linestyle === 'dotted') {
    ctx.setLineDash([1 * hpr, 3 * hpr]);
  } else {
    ctx.setLineDash([]);
  }
}

/**
 * Draws white selection‑handle circles at the given CSS‑pixel positions.
 * The caller is expected to call save/restore around draw + drawHandles.
 */
export function drawHandles(
  ctx: CanvasRenderingContext2D,
  hpr: number,
  _vpr: number,
  positions: Point[],
  color: string
): void {
  const handleR = Math.round(6 * hpr);
  const strokeW = Math.round(2 * hpr);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeW;
  for (const p of positions) {
    ctx.beginPath();
    ctx.arc(Math.round(p.x * hpr), Math.round(p.y * _vpr), handleR, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
