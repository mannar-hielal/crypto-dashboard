// ─── Shared coordinate utilities for drawing hit-testing ──────────
//
// Pure math + coordinate-space helpers used by both DrawingPrimitive
// (ISeriesPrimitive hit-test) and useDrawingInteraction (pointer event
// hit-test). Eliminates the 3-way duplication of pointToSegmentDist.

import type { UTCTimestamp } from 'lightweight-charts';
import type { Drawing } from '@/lib/drawing/types';

/**
 * Distance from point (px, py) to line segment (x1,y1)→(x2,y2).
 * Clamps the projection parameter t to [0, 1] so the nearest point
 * stays within the segment (not the infinite line).
 */
export function pointToSegmentDist(
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

/**
 * Distance from point (px, py) to a RAY starting at (x1,y1) through (x2,y2).
 * The ray extends infinitely past B — projection parameter t is clamped
 * to [0, ∞), NOT [0, 1]. Point behind A (t < 0) returns distance to A.
 */
export function pointToRayDist(
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
  const t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;
  return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
}

/**
 * Coordinate converter pair — passed into hitTestBodies so callers
 * can bridge between chart/series and pixel space without coupling.
 */
export interface CoordinateConverters {
  timeToX: (time: UTCTimestamp) => number | null;
  priceToY: (price: number) => number | null;
}

/**
 * Hit-test all drawing bodies at screen coordinate (x, y).
 * Handles trendline (segment), ray (half-line past B), horizontal (full-width Y),
 * vertical (full-height X), and parallel channel (two parallel segments).
 * Returns the id of the first drawing whose body is within `threshold`
 * pixels, or null.
 */
export function hitTestBodies(
  x: number,
  y: number,
  drawings: Drawing[],
  converters: CoordinateConverters,
  threshold = 8
): string | null {
  const { timeToX, priceToY } = converters;
  for (const drawing of drawings) {
    const { type, points } = drawing.shape;

    if (type === 'horizontal' && points.length >= 1) {
      const yLine = priceToY(points[0].price);
      if (yLine !== null && Math.abs(y - yLine) < threshold) return drawing.id;
      continue;
    }

    if (type === 'vertical' && points.length >= 1) {
      const xLine = timeToX(points[0].time);
      if (xLine !== null && Math.abs(x - xLine) < threshold) return drawing.id;
      continue;
    }

    if (type === 'parallel') {
      if (points.length < 3) continue;
      // Base line: A → B
      const ax = timeToX(points[0].time);
      const ay = priceToY(points[0].price);
      const bx = timeToX(points[1].time);
      const by = priceToY(points[1].price);
      // Offset line: C → C + (B − A)
      const cx = timeToX(points[2].time);
      const cy = priceToY(points[2].price);
      if (ax === null || ay === null || bx === null || by === null || cx === null || cy === null)
        continue;
      const dx = bx - ax;
      const dy = by - ay;
      // Hit test the base segment A→B
      if (pointToSegmentDist(x, y, ax, ay, bx, by) < threshold) return drawing.id;
      // Hit test the offset segment C→C+(B−A)
      if (pointToSegmentDist(x, y, cx, cy, cx + dx, cy + dy) < threshold) return drawing.id;
      continue;
    }

    if (type === 'polyline') {
      if (points.length < 2) continue;
      for (let i = 0; i < points.length - 1; i++) {
        const x1 = timeToX(points[i].time);
        const y1 = priceToY(points[i].price);
        const x2 = timeToX(points[i + 1].time);
        const y2 = priceToY(points[i + 1].price);
        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
        if (pointToSegmentDist(x, y, x1, y1, x2, y2) < threshold) return drawing.id;
      }
      continue;
    }

    // trendline + ray both need 2 points
    if (points.length < 2) continue;

    // Iterate through consecutive point pairs.
    // For trendline (exactly 2 points), this runs once.
    // For future polyline (N points), this runs N-1 times.
    for (let i = 0; i < points.length - 1; i++) {
      const x1 = timeToX(points[i].time);
      const y1 = priceToY(points[i].price);
      const x2 = timeToX(points[i + 1].time);
      const y2 = priceToY(points[i + 1].price);
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

      if (type === 'ray') {
        if (pointToRayDist(x, y, x1, y1, x2, y2) < threshold) return drawing.id;
      } else {
        if (pointToSegmentDist(x, y, x1, y1, x2, y2) < threshold) return drawing.id;
      }
    }
  }
  return null;
}
