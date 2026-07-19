/**
 * drawing/coordinates tests
 *
 * Pure-math hit-testing utilities shared between DrawingPrimitive and
 * useDrawingInteraction. These are the functions that were previously
 * duplicated across 3 locations.
 */

import { describe, it, expect } from 'vitest';
import {
  pointToSegmentDist,
  pointToRayDist,
  hitTestBodies,
  pointInRect,
  distToRect,
  nearestTextShapeDistance,
} from '../drawing/coordinates';
import type { Drawing } from '@/lib/drawing/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDrawing(
  points: { time: number; price: number }[],
  id = 'd1',
  type: 'trendline' | 'horizontal' | 'vertical' | 'ray' | 'parallel' | 'polyline' = 'trendline'
): Drawing {
  return {
    id,
    zIndex: 1,
    isLocked: false,
    color: '#2196f3',
    textColor: '#ffffff',
    lineWidth: 2,
    lineStyle: 'solid',
    fontSize: 14,
    backgroundColor: '#25234e',
    shape: {
      type,
      points: points.map((p) => ({
        time: p.time as Drawing['shape']['points'][number]['time'],
        price: p.price,
      })),
    },
    paneIndex: 0,
  };
}

// Dummy converters — map time→x (1:1), price→y (1:1)
const dummyConverters = {
  timeToX: (t: Drawing['shape']['points'][number]['time']) => t as number,
  priceToY: (p: number) => p,
};

// ─── pointToSegmentDist ─────────────────────────────────────────────────────

describe('pointToSegmentDist', () => {
  it('returns 0 when the point is on the segment', () => {
    expect(pointToSegmentDist(5, 5, 0, 0, 10, 10)).toBeCloseTo(0, 5);
  });

  it('returns the perpendicular distance for a point off the segment', () => {
    // Horizontal segment (0,0)→(10,0), point at (5,3)
    const dist = pointToSegmentDist(5, 3, 0, 0, 10, 0);
    expect(dist).toBeCloseTo(3, 5);
  });

  it('clamps to the nearest endpoint when the projection falls outside [0,1]', () => {
    // Segment (0,0)→(10,0), point at (15, 5)
    // Nearest point is endpoint (10,0), distance = sqrt(25+25) ≈ 7.07
    const dist = pointToSegmentDist(15, 5, 0, 0, 10, 0);
    expect(dist).toBeCloseTo(Math.sqrt(25 + 25), 5);
  });

  it('clamps to the start endpoint when projection is negative', () => {
    // Segment (5,0)→(10,0), point at (0, 4)
    // Nearest point is endpoint (5,0), distance = sqrt(25+16) ≈ 6.4
    const dist = pointToSegmentDist(0, 4, 5, 0, 10, 0);
    expect(dist).toBeCloseTo(Math.sqrt(25 + 16), 5);
  });

  it('returns distance to the point when both endpoints are the same', () => {
    expect(pointToSegmentDist(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 5);
  });

  it('handles vertical segments', () => {
    // Vertical segment (5,0)→(5,10), point at (8, 5)
    const dist = pointToSegmentDist(8, 5, 5, 0, 5, 10);
    expect(dist).toBeCloseTo(3, 5);
  });

  it('handles diagonal segments', () => {
    // Segment (0,0)→(3,4) (length 5), point at (0, 3)
    // Projection t = (0*3 + 3*4)/(9+16) = 12/25 = 0.48
    // Nearest point = (0+0.48*3, 0+0.48*4) = (1.44, 1.92)
    // Distance = sqrt((0-1.44)^2 + (3-1.92)^2) = sqrt(2.0736 + 1.1664) = sqrt(3.24) = 1.8
    const dist = pointToSegmentDist(0, 3, 0, 0, 3, 4);
    expect(dist).toBeCloseTo(1.8, 5);
  });
});

// ─── pointToRayDist ─────────────────────────────────────────────────────────

describe('pointToRayDist', () => {
  it('returns 0 when the point is on the ray', () => {
    expect(pointToRayDist(7, 7, 0, 0, 10, 10)).toBeCloseTo(0, 5);
  });

  it('extends past B without clamping (core ray property)', () => {
    // Ray from (0,0) through (10,0), point at (20, 3) is past B
    // Old segment distance would clamp to B and return sqrt(100+9)≈10.44
    // Ray distance should be the perpendicular 3
    const dist = pointToRayDist(20, 3, 0, 0, 10, 0);
    expect(dist).toBeCloseTo(3, 5);
  });

  it('clamps behind A (returns distance to A, not distance to infinite line)', () => {
    // Ray A=(5,0), B=(10,0), point at (0, 4)
    // Behind A: nearest point is A itself, distance = sqrt(25+16) ≈ 6.4
    const dist = pointToRayDist(0, 4, 5, 0, 10, 0);
    expect(dist).toBeCloseTo(Math.sqrt(25 + 16), 5);
  });

  it('returns the perpendicular distance for a point on the ray between A and B', () => {
    const dist = pointToRayDist(5, 3, 0, 0, 10, 0);
    expect(dist).toBeCloseTo(3, 5);
  });

  it('handles degenerate case where A and B are the same point', () => {
    expect(pointToRayDist(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 5);
  });

  it('handles a vertical ray', () => {
    // Ray from (5, 0) through (5, 10), point at (8, 20) is past B
    const dist = pointToRayDist(8, 20, 5, 0, 5, 10);
    expect(dist).toBeCloseTo(3, 5);
  });

  it('handles a diagonal ray', () => {
    // Ray A=(0,0), B=(3,4) (length 5), point at (0, 8)
    // The infinite line: t = (0*3 + 8*4)/(9+16) = 32/25 = 1.28 (past B, on the ray)
    // Nearest point = (0+1.28*3, 0+1.28*4) = (3.84, 5.12)
    // Distance = sqrt((0-3.84)^2 + (8-5.12)^2) = sqrt(14.7456 + 8.2944) = sqrt(23.04) = 4.8
    const dist = pointToRayDist(0, 8, 0, 0, 3, 4);
    expect(dist).toBeCloseTo(4.8, 5);
  });
});

// ─── hitTestBodies ──────────────────────────────────────────────────────────

describe('hitTestBodies', () => {
  it('returns the drawing id when the point is within the threshold', () => {
    const drawing = makeDrawing([
      { time: 0, price: 0 },
      { time: 100, price: 0 },
    ]);

    const result = hitTestBodies(50, 0, [drawing], dummyConverters, 8);
    expect(result).toBe('d1');
  });

  it('returns the drawing id when the point is within threshold of the line', () => {
    const drawing = makeDrawing([
      { time: 0, price: 0 },
      { time: 100, price: 0 },
    ]);

    // Point at (50, 5) — 5px away from the line, within 8px threshold
    const result = hitTestBodies(50, 5, [drawing], dummyConverters, 8);
    expect(result).toBe('d1');
  });

  it('returns null when the point is beyond the threshold', () => {
    const drawing = makeDrawing([
      { time: 0, price: 0 },
      { time: 100, price: 0 },
    ]);

    const result = hitTestBodies(50, 10, [drawing], dummyConverters, 8);
    expect(result).toBeNull();
  });

  it('returns null for a drawing with fewer than 2 points', () => {
    const drawing = makeDrawing([{ time: 0, price: 0 }]);

    const result = hitTestBodies(0, 0, [drawing], dummyConverters, 8);
    expect(result).toBeNull();
  });

  it('returns null for an empty drawings array', () => {
    const result = hitTestBodies(50, 5, [], dummyConverters, 8);
    expect(result).toBeNull();
  });

  it('returns the first matching drawing when multiple are in range', () => {
    const d1 = makeDrawing(
      [
        { time: 0, price: 0 },
        { time: 100, price: 0 },
      ],
      'd1'
    );
    const d2 = makeDrawing(
      [
        { time: 0, price: 1 },
        { time: 100, price: 1 },
      ],
      'd2'
    );

    const result = hitTestBodies(50, 0, [d1, d2], dummyConverters, 8);
    expect(result).toBe('d1');
  });

  it('respects custom threshold', () => {
    const drawing = makeDrawing([
      { time: 0, price: 0 },
      { time: 100, price: 0 },
    ]);

    // 15px away — within a 20px threshold but outside 8px
    expect(hitTestBodies(50, 15, [drawing], dummyConverters, 8)).toBeNull();
    expect(hitTestBodies(50, 15, [drawing], dummyConverters, 20)).toBe('d1');
  });

  it('skips drawings where coordinate conversion returns null', () => {
    const drawing = makeDrawing([
      { time: 0, price: 0 },
      { time: 100, price: 0 },
    ]);

    // Converters that always return null — simulating offscreen coords
    const nullConverters = {
      timeToX: () => null,
      priceToY: () => null,
    };

    const result = hitTestBodies(50, 0, [drawing], nullConverters, 8);
    expect(result).toBeNull();
  });

  it('handles multi-segment drawings (polyline-style)', () => {
    const drawing = makeDrawing([
      { time: 0, price: 0 },
      { time: 50, price: 50 },
      { time: 100, price: 0 },
    ]);

    // Point near the second segment (50,50)→(100,0)
    const result = hitTestBodies(75, 22, [drawing], dummyConverters, 8);
    expect(result).toBe('d1');
  });

  it('horizontal line: returns id when Y is within threshold of the anchor price', () => {
    const drawing = makeDrawing([{ time: 50, price: 100 }], 'h1', 'horizontal');

    // Point at (anything, 100) — directly on the line
    expect(hitTestBodies(0, 100, [drawing], dummyConverters, 8)).toBe('h1');
    // Within threshold
    expect(hitTestBodies(200, 105, [drawing], dummyConverters, 8)).toBe('h1');
    // Beyond threshold
    expect(hitTestBodies(200, 110, [drawing], dummyConverters, 8)).toBeNull();
  });

  it('horizontal line: hit-testable across full chart width (infinite X)', () => {
    const drawing = makeDrawing([{ time: 50, price: 100 }], 'h1', 'horizontal');

    // The horizontal line ignores the X coordinate (spans full chart)
    expect(hitTestBodies(-999, 100, [drawing], dummyConverters, 8)).toBe('h1');
    expect(hitTestBodies(999, 100, [drawing], dummyConverters, 8)).toBe('h1');
  });

  it('vertical line: returns id when X is within threshold of the anchor time', () => {
    const drawing = makeDrawing([{ time: 50, price: 100 }], 'v1', 'vertical');

    // Point directly on the line
    expect(hitTestBodies(50, 0, [drawing], dummyConverters, 8)).toBe('v1');
    expect(hitTestBodies(50, 999, [drawing], dummyConverters, 8)).toBe('v1');
    // Within threshold
    expect(hitTestBodies(55, 50, [drawing], dummyConverters, 8)).toBe('v1');
    // Beyond threshold
    expect(hitTestBodies(60, 50, [drawing], dummyConverters, 8)).toBeNull();
  });

  it('ray: extends infinitely past B (hit-testable beyond B)', () => {
    const drawing = makeDrawing(
      [
        { time: 0, price: 0 },
        { time: 10, price: 0 },
      ],
      'r1',
      'ray'
    );

    // Point past B (x=20) within 3px perpendicular — should hit (no clamp)
    expect(hitTestBodies(20, 3, [drawing], dummyConverters, 8)).toBe('r1');
    // Trendline of same geometry would NOT hit (clamped to B)
    const trendlineDrawing = makeDrawing(
      [
        { time: 0, price: 0 },
        { time: 10, price: 0 },
      ],
      't1'
    );
    expect(hitTestBodies(20, 3, [trendlineDrawing], dummyConverters, 8)).toBeNull();
  });

  it('ray: not hit-testable behind A (returns distance to A)', () => {
    const drawing = makeDrawing(
      [
        { time: 5, price: 0 },
        { time: 10, price: 0 },
      ],
      'r1',
      'ray'
    );

    // Point behind A (x=0, y=4) — distance to A = sqrt(25+16) ≈ 6.4
    // Within 8px threshold, but the nearest point is A itself
    // Hit-testing should still return hit because 6.4 < 8
    expect(hitTestBodies(0, 4, [drawing], dummyConverters, 8)).toBe('r1');
    // Far behind A — beyond threshold
    expect(hitTestBodies(-100, 100, [drawing], dummyConverters, 8)).toBeNull();
  });

  it('parallel channel: hit-testable on the base line A→B', () => {
    const drawing = makeDrawing(
      [
        { time: 0, price: 0 },
        { time: 100, price: 0 },
        { time: 0, price: 50 },
      ],
      'p1',
      'parallel'
    );

    // Point on the base line
    expect(hitTestBodies(50, 0, [drawing], dummyConverters, 8)).toBe('p1');
    expect(hitTestBodies(50, 5, [drawing], dummyConverters, 8)).toBe('p1');
  });

  it('parallel channel: hit-testable on the offset line C→C+(B−A)', () => {
    const drawing = makeDrawing(
      [
        { time: 0, price: 0 },
        { time: 100, price: 0 },
        { time: 0, price: 50 },
      ],
      'p1',
      'parallel'
    );
    // Offset line: C(0, 50) → C+(B−A) = (100, 50)
    // Point at (50, 50) should hit
    expect(hitTestBodies(50, 50, [drawing], dummyConverters, 8)).toBe('p1');
    expect(hitTestBodies(50, 53, [drawing], dummyConverters, 8)).toBe('p1');
  });

  it('parallel channel: not hit-testable between the two lines (gap > threshold)', () => {
    const drawing = makeDrawing(
      [
        { time: 0, price: 0 },
        { time: 100, price: 0 },
        { time: 0, price: 50 },
      ],
      'p1',
      'parallel'
    );
    // Point at (50, 25) — between the two lines, >8px from both
    expect(hitTestBodies(50, 25, [drawing], dummyConverters, 8)).toBeNull();
  });

  it('parallel channel: not hit-testable with fewer than 3 points', () => {
    const drawing = makeDrawing(
      [
        { time: 0, price: 0 },
        { time: 100, price: 0 },
      ],
      'p1',
      'parallel'
    );
    expect(hitTestBodies(50, 0, [drawing], dummyConverters, 8)).toBeNull();
  });

  // ── polyline ──────────────────────────────────────────────────────────────

  it('polyline: hit-testable on segment A→B', () => {
    const drawing = makeDrawing(
      [
        { time: 0, price: 0 },
        { time: 100, price: 0 },
      ],
      'pl1',
      'polyline'
    );
    expect(hitTestBodies(50, 0, [drawing], dummyConverters, 8)).toBe('pl1');
    expect(hitTestBodies(50, 5, [drawing], dummyConverters, 8)).toBe('pl1');
  });

  it('polyline: hit-testable on segment B→C (second segment)', () => {
    const drawing = makeDrawing(
      [
        { time: 0, price: 0 },
        { time: 100, price: 0 },
        { time: 100, price: 100 },
      ],
      'pl1',
      'polyline'
    );
    // Point on B→C segment (vertical at x=100, y=50)
    expect(hitTestBodies(100, 50, [drawing], dummyConverters, 8)).toBe('pl1');
  });

  it('polyline: not hit-testable between non-adjacent segments', () => {
    const drawing = makeDrawing(
      [
        { time: 0, price: 0 },
        { time: 100, price: 0 },
        { time: 100, price: 100 },
      ],
      'pl1',
      'polyline'
    );
    // Point at (50, 50) — far from both segments A→B and B→C
    expect(hitTestBodies(50, 50, [drawing], dummyConverters, 8)).toBeNull();
  });

  it('polyline: not hit-testable with fewer than 2 points', () => {
    const drawing = makeDrawing([{ time: 0, price: 0 }], 'pl1', 'polyline');
    expect(hitTestBodies(0, 0, [drawing], dummyConverters, 8)).toBeNull();
  });
});

// ─── P6 — pointInRect helper ────────────────────────────────────────────────

describe('pointInRect', () => {
  it('true when point is inside the rectangle', () => {
    expect(pointInRect(50, 50, 0, 0, 100, 100)).toBe(true);
  });
  it('true on the boundary', () => {
    expect(pointInRect(0, 0, 0, 0, 100, 100)).toBe(true);
    expect(pointInRect(100, 100, 0, 0, 100, 100)).toBe(true);
  });
  it('false when point is outside the rectangle', () => {
    expect(pointInRect(101, 50, 0, 0, 100, 100)).toBe(false);
    expect(pointInRect(-1, 50, 0, 0, 100, 100)).toBe(false);
    expect(pointInRect(50, 200, 0, 0, 100, 100)).toBe(false);
  });
  it('respects the padding argument (expands the box)', () => {
    // Point at 105 — outside on bare box, inside with 10px padding
    expect(pointInRect(105, 50, 0, 0, 100, 100, 0)).toBe(false);
    expect(pointInRect(105, 50, 0, 0, 100, 100, 10)).toBe(true);
  });
});

// ─── v4 — distToRect helper ───────────────────────────────────────────────

describe('distToRect', () => {
  it('returns 0 when the point is inside the rectangle', () => {
    expect(distToRect(50, 50, 0, 0, 100, 100)).toBe(0);
    expect(distToRect(0, 0, 0, 0, 100, 100)).toBe(0);
    expect(distToRect(100, 100, 0, 0, 100, 100)).toBe(0);
  });
  it('returns the horizontal distance when the point is to the right', () => {
    expect(distToRect(150, 50, 0, 0, 100, 100)).toBe(50);
  });
  it('returns the vertical distance when the point is below', () => {
    expect(distToRect(50, 150, 0, 0, 100, 100)).toBe(50);
  });
  it('returns the diagonal distance when the point is below-right', () => {
    // Corner at (100, 100); point at (110, 110) → dx=10, dy=10 → dist ≈ 14.14
    expect(distToRect(110, 110, 0, 0, 100, 100)).toBeCloseTo(Math.sqrt(200), 5);
  });
  it('returns 0 for points on the rectangle edge', () => {
    expect(distToRect(100, 50, 0, 0, 100, 100)).toBe(0);
    expect(distToRect(50, 0, 0, 0, 100, 100)).toBe(0);
  });
});

// ─── v4 — nearestTextShapeDistance (spawn-suppression guard helper) ───────

describe('nearestTextShapeDistance', () => {
  function makeTextDrawing(
    id: string,
    anchor: { time: number; price: number },
    over: Partial<Drawing> = {}
  ): Drawing {
    return {
      id,
      zIndex: 1,
      isLocked: false,
      color: '#a555e2',
      textColor: '#fcfcfd',
      lineWidth: 1,
      lineStyle: 'solid',
      fontSize: 14,
      backgroundColor: '#0a0a0a',
      shape: {
        type: 'text',
        points: [
          {
            time: anchor.time as Drawing['shape']['points'][number]['time'],
            price: anchor.price,
          },
        ],
      },
      paneIndex: 0,
      ...over,
    };
  }

  it('returns null when no drawings are passed', () => {
    expect(nearestTextShapeDistance(50, 50, [], () => null)).toBeNull();
  });

  it('returns the drawing id with dist=0 when the point is inside the expanded box', () => {
    const d = makeTextDrawing('d1', { time: 100, price: 100 });
    // boxFor returns a 50×16 box centered at (100, 100)
    const result = nearestTextShapeDistance(105, 105, [d], () => ({
      x: 75,
      y: 92,
      w: 50,
      h: 16,
    }));
    expect(result).not.toBeNull();
    expect(result!.id).toBe('d1');
    expect(result!.dist).toBe(0);
  });

  it('returns the distance to the nearest edge when the point is outside', () => {
    const d = makeTextDrawing('d1', { time: 100, price: 100 });
    // expanded box: x=75, y=92, w=60+16=76, h=18+16=34 → covers x=[75-8, 151+8]=[67, 159], y=[92-8, 110+8]=[84, 118]
    // Wait — boxFor returns the RAW box; expansion (padding + min) is applied inside the helper.
    // box.x=75, box.y=92, box.w=60, box.h=18 → expanded: x=75-8=67, y=92-8=84, w=60+16=76, h=18+16=34
    // → covers x=[67, 143], y=[84, 118]
    // Point at (150, 100) → dx = 150-143 = 7, dy = 0 → dist = 7
    const result = nearestTextShapeDistance(150, 100, [d], () => ({
      x: 75,
      y: 92,
      w: 60,
      h: 18,
    }));
    expect(result).not.toBeNull();
    expect(result!.id).toBe('d1');
    expect(result!.dist).toBe(7);
  });

  it('expands a tiny box (50×17) to the 60×18 minimum + 8px padding', () => {
    const d = makeTextDrawing('d1', { time: 100, price: 100 });
    // boxFor returns a 50×17 box at (75, 91.5)
    // expanded: hitW = max(50, 60) + 16 = 76, hitH = max(17, 18) + 16 = 34
    // x = 75 - 8 = 67, y = 91.5 - 8 = 83.5
    // → covers x=[67, 143], y=[83.5, 117.5]
    // Point at (144, 100) → 1 px outside the expanded box → dist = 1
    const result = nearestTextShapeDistance(144, 100, [d], () => ({
      x: 75,
      y: 91.5,
      w: 50,
      h: 17,
    }));
    expect(result).not.toBeNull();
    expect(result!.id).toBe('d1');
    expect(result!.dist).toBeCloseTo(1, 5);
  });

  it('skips non-text shapes (trendline, horizontal, etc.)', () => {
    const trendline: Drawing = {
      id: 't1',
      zIndex: 1,
      isLocked: false,
      color: '#2196f3',
      textColor: '#ffffff',
      lineWidth: 2,
      lineStyle: 'solid',
      fontSize: 14,
      backgroundColor: '#25234e',
      shape: {
        type: 'trendline',
        points: [
          { time: 0 as Drawing['shape']['points'][number]['time'], price: 0 },
          { time: 100 as Drawing['shape']['points'][number]['time'], price: 100 },
        ],
      },
      paneIndex: 0,
    };
    // boxFor returns the trendline's bbox — but the helper should skip
    // trendline shapes entirely (only text/note/callout/priceNote/priceLabel).
    const result = nearestTextShapeDistance(50, 50, [trendline], () => ({
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    }));
    expect(result).toBeNull();
  });

  it('returns null when boxFor returns null for all drawings (anchor off-screen)', () => {
    const d = makeTextDrawing('d1', { time: 100, price: 100 });
    const result = nearestTextShapeDistance(50, 50, [d], () => null);
    expect(result).toBeNull();
  });

  it('returns the closest of multiple text drawings', () => {
    const d1 = makeTextDrawing('d1', { time: 100, price: 100 });
    const d2 = makeTextDrawing('d2', { time: 200, price: 200 });
    // d1 box at (75, 91.5, 50, 17) → expanded covers x=[67, 143]
    // d2 box at (175, 191.5, 50, 17) → expanded covers x=[167, 243]
    // Point at (160, 100) → d1 dist = 17 (160-143), d2 dist = 7 (167-160)
    let callCount = 0;
    const result = nearestTextShapeDistance(160, 100, [d1, d2], (drawing) => {
      callCount += 1;
      const x = drawing.id === 'd1' ? 75 : 175;
      return { x, y: 91.5, w: 50, h: 17 };
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe('d2');
    expect(result!.dist).toBeCloseTo(7, 5);
    expect(callCount).toBe(2);
  });
});
