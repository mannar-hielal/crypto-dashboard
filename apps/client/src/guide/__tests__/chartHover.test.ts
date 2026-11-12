import { describe, expect, it, vi } from 'vitest';
import {
  candleBoxFrom,
  crosshairHover,
  hasHoverListeners,
  matchesHover,
  newestCandleBox,
  registerNewestCandle,
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

  it('should box the newest candle in viewport pixels, and give up when it is off the plot', () => {
    const box = { top: 100, left: 50, width: 800, height: 400 };
    // x 700 in the chart, high at y 120 and low at y 180, 6 px bars
    expect(candleBoxFrom(box, 700, 120, 180, 6, 740)).toEqual({
      top: 220,
      left: 745,
      width: 10, // a thin candle still gets a ring-able box
      height: 60,
    });
    // A flat candle (high = low) still has a height
    expect(candleBoxFrom(box, 700, 150, 150, 12, 740)?.height).toBe(12);
    expect(candleBoxFrom(box, null, 120, 180, 6, 740)).toBeNull(); // not in the data
    expect(candleBoxFrom(box, 760, 120, 180, 6, 740)).toBeNull(); // under the price scale
    expect(candleBoxFrom(box, -4, 120, 180, 6, 740)).toBeNull(); // scrolled off left
    expect(candleBoxFrom(box, 700, null, 180, 6, 740)).toBeNull();
  });

  it('should find the newest candle of the chart inside the anchor, and forget an unmounted one', () => {
    const anchor = document.createElement('div');
    const container = document.createElement('div');
    anchor.appendChild(container);
    const other = document.createElement('div');
    const box = { top: 1, left: 2, width: 10, height: 12 };
    const unregister = registerNewestCandle(container, () => box);
    expect(newestCandleBox(anchor)).toEqual(box);
    expect(newestCandleBox(other)).toBeNull();
    unregister();
    expect(newestCandleBox(anchor)).toBeNull();
  });
});
