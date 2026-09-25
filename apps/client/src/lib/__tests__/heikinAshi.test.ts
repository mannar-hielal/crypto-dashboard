import { describe, expect, it } from 'vitest';
import { toHeikinAshi } from '../heikinAshi';

const bar = (time: number, open: number, high: number, low: number, close: number) => ({
  time,
  open,
  high,
  low,
  close,
  volume: 1,
});

describe('toHeikinAshi', () => {
  const bars = [bar(1, 10, 14, 8, 12), bar(2, 12, 15, 11, 14), bar(3, 14, 14, 9, 10)];
  const ha = toHeikinAshi(bars);

  it('seeds the first bar with (open + close) / 2', () => {
    expect(ha[0].open).toBe(11);
    expect(ha[0].close).toBe(11); // (10 + 14 + 8 + 12) / 4
  });

  it('uses the previous HA bar for open and the OHLC average for close', () => {
    expect(ha[1].open).toBe(11); // (11 + 11) / 2
    expect(ha[1].close).toBe(13); // (12 + 15 + 11 + 14) / 4
    expect(ha[2].open).toBe(12); // (11 + 13) / 2
    expect(ha[2].close).toBe(11.75); // (14 + 14 + 9 + 10) / 4
  });

  it('keeps high/low as the envelope of the real range and the HA body', () => {
    for (let i = 0; i < ha.length; i++) {
      expect(ha[i].high).toBe(Math.max(bars[i].high, ha[i].open, ha[i].close));
      expect(ha[i].low).toBe(Math.min(bars[i].low, ha[i].open, ha[i].close));
    }
  });

  it('preserves time and extra fields, and does not mutate the input', () => {
    expect(ha.map((b) => b.time)).toEqual([1, 2, 3]);
    expect(ha[0].volume).toBe(1);
    expect(bars[0].open).toBe(10);
  });

  it('returns an empty series for no bars', () => {
    expect(toHeikinAshi([])).toEqual([]);
  });
});
