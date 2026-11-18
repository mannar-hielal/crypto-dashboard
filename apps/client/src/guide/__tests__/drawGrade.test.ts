import { describe, expect, it } from 'vitest';
import { gradeLine, type DrawTarget, type Pt } from '@/guide/drawGrade';

// Made-up pixels: 10 candles 30 px apart, a 200 px tall chart. The path climbs, dips, then climbs
const path: Pt[] = [
  { x: 30, y: 160 },
  { x: 60, y: 140 },
  { x: 90, y: 120 },
  { x: 120, y: 135 },
  { x: 150, y: 100 },
  { x: 180, y: 70 },
  { x: 210, y: 50 },
];
const target: DrawTarget = {
  buy: path[0],
  sell: path[path.length - 1],
  path,
  spacing: 30,
  height: 200,
};

describe('gradeLine', () => {
  it('should accept a line that follows the path from the buy to the sell', () => {
    expect(gradeLine(path, target, true)).toBe(true);
  });

  it('should accept a line drawn from right to left (the leftmost point is the start)', () => {
    expect(gradeLine([...path].reverse(), target, true)).toBe(true);
  });

  it('should accept a rough line: a few pixels off everywhere', () => {
    const rough = path.map((p) => ({ x: p.x + 5, y: p.y - 8 }));
    expect(gradeLine(rough, target, true)).toBe(true);
  });

  it('should refuse a line with fewer than two points', () => {
    expect(gradeLine([], target, true)).toBe(false);
    expect(gradeLine([path[0]], target, true)).toBe(false);
  });

  it('should refuse a line that starts far from the buy', () => {
    const late = path.slice(3);
    expect(gradeLine(late, target, true)).toBe(false);
  });

  it('should refuse a line that stops before the sell', () => {
    expect(gradeLine(path.slice(0, 5), target, true)).toBe(false);
  });

  it('should refuse a line at the wrong height, below the candles (a similar shape, another price)', () => {
    const low = path.map((p) => ({ x: p.x, y: p.y + 90 }));
    expect(gradeLine(low, target, true)).toBe(false);
  });

  it('should check only the two ends for a keyboard learner, who places the buy and the sell', () => {
    const straight = [target.buy, target.sell];
    expect(gradeLine(straight, target, false)).toBe(true);
    // …and a freehand straight line that cuts across the dip is judged on the path too
    expect(gradeLine(straight, target, true)).toBe(true);
    const wild = [target.buy, { x: 120, y: 5 }, target.sell];
    expect(gradeLine(wild, target, false)).toBe(true);
    expect(gradeLine(wild, target, true)).toBe(false);
  });
});
