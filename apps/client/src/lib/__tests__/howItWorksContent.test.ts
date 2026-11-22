import { describe, expect, it } from 'vitest';

import { LESSONS } from '@/guide/lessons';
import { INTERVALS, SYMBOLS } from '@/lib/markets';
import { CHART_STATS, PATH_CHAPTERS } from '@/lib/howItWorksContent';

// The page's numbers and lesson list are claims about the app: pinned to the code that owns them

describe('the How it works page claims', () => {
  it('should state the coin and timeframe counts the app has', () => {
    const stat = (label: RegExp) => CHART_STATS.find((s) => label.test(s.label))!;
    expect(stat(/coins/).value).toBe(String(SYMBOLS.length));
    expect(stat(/timeframes/).value).toBe(String(INTERVALS.length));
    for (const s of SYMBOLS) expect(stat(/coins/).label).toContain(s.symbol.replace(/USDT$/, ''));
  });

  it('should list every lesson of the path, by number and title', () => {
    const stops = PATH_CHAPTERS.flatMap((c) => c.stops).filter((t) => t.startsWith('Lesson '));
    expect(stops).toHaveLength(LESSONS.length);
    for (const l of LESSONS) {
      const stop = stops.find((t) => t.startsWith(`Lesson ${l.number} · `));
      expect(stop, `lesson ${l.number}`).toBeDefined();
    }
  });
});
