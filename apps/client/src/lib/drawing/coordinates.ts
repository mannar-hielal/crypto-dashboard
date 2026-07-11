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
 * Coordinate converter pair — passed into hitTestBodies so callers
 * can bridge between chart/series and pixel space without coupling.
 */
export interface CoordinateConverters {
  timeToX: (time: UTCTimestamp) => number | null;
  priceToY: (price: number) => number | null;
}

/**
 * Hit-test all drawing bodies (line segments) at screen coordinate (x, y).
 * Returns the id of the first drawing whose body is within `threshold`
 * pixels, or null. Iterates in array order (caller is responsible for
 * z-order if "closest" is needed — see DrawingPrimitive.hitTest for that
 * variant which tracks distance + priority).
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
    const points = drawing.shape.points;
    if (points.length < 2) continue;
    for (let i = 0; i < points.length - 1; i++) {
      const x1 = timeToX(points[i].time);
      const y1 = priceToY(points[i].price);
      const x2 = timeToX(points[i + 1].time);
      const y2 = priceToY(points[i + 1].price);
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
      if (pointToSegmentDist(x, y, x1, y1, x2, y2) < threshold) {
        return drawing.id;
      }
    }
  }
  return null;
}
