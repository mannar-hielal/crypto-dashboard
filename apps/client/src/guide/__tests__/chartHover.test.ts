import { describe, expect, it, vi } from 'vitest';
import {
  crosshairHover,
  hasHoverListeners,
  matchesHover,
  onHover,
  reportHover,
} from '@/guide/chartHover';

const bar = (open: number, close: number, isLast = false) => ({ time: 1, open, close, isLast });

describe('chartHover', () => {
  it('should tell listeners what the crosshair is on, and stop when they leave', () => {
    expect(hasHoverListeners()).toBe(false);
    const seen = vi.fn();
    const off = onHover(seen);
    expect(hasHoverListeners()).toBe(true);
    reportHover(bar(1, 2));
    reportHover(null);
    expect(seen.mock.calls).toEqual([[bar(1, 2)], [null]]);
    off();
    reportHover(bar(1, 2));
    expect(seen).toHaveBeenCalledTimes(2);
    expect(hasHoverListeners()).toBe(false);
  });

  it('should match the newest candle, or a falling one', () => {
    expect(matchesHover('last', bar(1, 2, true))).toBe(true);
    expect(matchesHover('last', bar(1, 2, false))).toBe(false);
    expect(matchesHover('falling', bar(2, 1))).toBe(true);
    expect(matchesHover('falling', bar(1, 1))).toBe(false);
    expect(matchesHover('falling', null)).toBe(false);
  });

  it('should read a crosshair move as a candle, or as nothing when off the chart or on a gap', () => {
    const c = { open: 1, close: 2 };
    expect(crosshairHover(100, true, c, 100)).toEqual({
      time: 100,
      open: 1,
      close: 2,
      isLast: true,
    });
    expect(crosshairHover(90, true, c, 100)?.isLast).toBe(false);
    expect(crosshairHover(undefined, false, undefined, 100)).toBeNull(); // left the chart
    expect(crosshairHover(100, false, c, 100)).toBeNull(); // on the legend column
    expect(crosshairHover(100, true, undefined, 100)).toBeNull(); // a gap with no candle
  });
});
