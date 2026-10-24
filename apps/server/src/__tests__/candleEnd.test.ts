import { describe, expect, it } from 'vitest';
import { intervalMs, snapEnd } from '../lib/candleEnd.js';

describe('snapEnd', () => {
  it('should snap to the open of the candle the time falls in', () => {
    const t = Date.UTC(2024, 0, 10, 13, 47, 21, 5);
    expect(snapEnd(t, '1m')).toBe(Date.UTC(2024, 0, 10, 13, 47));
    expect(snapEnd(t, '4h')).toBe(Date.UTC(2024, 0, 10, 12));
    expect(snapEnd(t, '1d')).toBe(Date.UTC(2024, 0, 10));
    // 10 Jan 2024 was a Wednesday: its weekly candle opened on Monday the 8th
    expect(snapEnd(t, '1w')).toBe(Date.UTC(2024, 0, 8));
    expect(snapEnd(t, '1M')).toBe(Date.UTC(2024, 0, 1));
  });

  it('should keep a time that is already a candle open', () => {
    expect(snapEnd(Date.UTC(2021, 4, 20), '1d')).toBe(Date.UTC(2021, 4, 20));
    expect(snapEnd(Date.UTC(2024, 0, 8), '1w')).toBe(Date.UTC(2024, 0, 8));
  });

  it('should give each interval its length', () => {
    expect(intervalMs('1h')).toBe(3_600_000);
    expect(intervalMs('1w')).toBe(7 * 86_400_000);
    expect(intervalMs('1M')).toBe(31 * 86_400_000);
  });
});
