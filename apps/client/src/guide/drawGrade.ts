/**
 * Grading a Draw a line card (owner's visual Q&A 2026-11-18): the learner's one line is checked
 * against two dated closes, the buy and the sell, and (for a freehand line) against the closes
 * between them. Pure pixel maths, so the tests need no chart. The widget turns dates and prices into
 * pixels (`DrawQuiz.tsx`).
 */

export interface Pt {
  x: number;
  y: number;
}

export interface DrawTarget {
  buy: Pt;
  sell: Pt;
  /** The closes from the buy to the sell, left to right: the dotted model path */
  path: Pt[];
  /** Pixels between two candles */
  spacing: number;
  /** The chart's height in pixels */
  height: number;
}

/** How far from the buy or the sell the line may start or end: candles across, share of the height */
export const END_TOLERANCE_CANDLES = 2.5;
export const END_TOLERANCE_HEIGHT = 0.18;
/** A freehand line follows the path to within this share of the height, on average */
export const FOLLOW_TOLERANCE_HEIGHT = 0.15;
/** The line must cover at least this share of the way from the buy to the sell */
export const MIN_SPAN = 0.8;

/** The line's height at x (a straight run between its points); past its ends, the end's height */
function yAt(sorted: Pt[], x: number): number {
  if (x <= sorted[0].x) return sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (x >= a.x && x <= b.x) {
      return b.x === a.x ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    }
  }
  return sorted[sorted.length - 1].y;
}

/**
 * Right when the line starts at the buy, ends at the sell and covers the way between. With `follow`
 * (a freehand line) it also stays near the closes in between; a keyboard learner places only the
 * buy and the sell, so there it is the two ends alone.
 */
export function gradeLine(points: Pt[], target: DrawTarget, follow: boolean): boolean {
  if (points.length < 2) return false;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  const dx = END_TOLERANCE_CANDLES * target.spacing;
  const dy = END_TOLERANCE_HEIGHT * target.height;
  const near = (p: Pt, t: Pt) => Math.abs(p.x - t.x) <= dx && Math.abs(p.y - t.y) <= dy;
  if (!near(start, target.buy) || !near(end, target.sell)) return false;
  if (end.x - start.x < MIN_SPAN * (target.sell.x - target.buy.x)) return false;
  if (!follow) return true;
  const gaps: number[] = [];
  for (const m of target.path) {
    gaps.push(Math.abs(yAt(sorted, m.x) - m.y));
  }
  const mean = gaps.reduce((t, g) => t + g, 0) / Math.max(gaps.length, 1);
  return mean <= FOLLOW_TOLERANCE_HEIGHT * target.height;
}
