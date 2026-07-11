/**
 * drawing/coordinates tests
 *
 * Pure-math hit-testing utilities shared between DrawingPrimitive and
 * useDrawingInteraction. These are the functions that were previously
 * duplicated across 3 locations.
 */

import { describe, it, expect } from 'vitest';
import { pointToSegmentDist, hitTestBodies } from '../drawing/coordinates';
import type { Drawing } from '@/lib/drawing/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDrawing(points: { time: number; price: number }[], id = 'd1'): Drawing {
  return {
    id,
    zIndex: 1,
    isLocked: false,
    color: '#2196f3',
    textColor: '#ffffff',
    lineWidth: 2,
    lineStyle: 'solid',
    shape: {
      type: 'trendline',
      points: points.map((p) => ({
        time: p.time as Drawing['shape']['points'][number]['time'],
        price: p.price,
      })),
    },
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
});
