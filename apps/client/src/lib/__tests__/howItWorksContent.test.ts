import { describe, expect, it } from 'vitest';

import { INDICATOR_CATALOG } from '@/lib/indicators/catalog';
import { INTERVALS, SYMBOLS } from '@/lib/markets';
import { FLIP_CARDS, TOURS } from '@/lib/howItWorksContent';

// The length of each tour clip in seconds (ffprobe of assets/landing/tours/<id>.mp4). A re-recorded clip
// updates its row here, so a click-zoom cue can never point past the end
const CLIP_SECONDS: Record<string, number> = {
  lesson: 28.17,
  chart: 16.75,
  journal: 13.2,
  draw: 14.2,
  pnl: 13.33,
};

// The page's numbers are claims about the app: pinned to the code that owns them

describe('the How it works page claims', () => {
  const card = (id: string) => FLIP_CARDS.find((c) => c.id === id)!;

  it('should state the coin and timeframe counts the app has', () => {
    expect(card('coins').value).toBe(String(SYMBOLS.length));
    expect(card('timeframes').value).toBe(String(INTERVALS.length));
    expect(card('indicators').value).toBe(String(INDICATOR_CATALOG.length));
    for (const s of SYMBOLS) expect(card('coins').label).toContain(s.symbol.replace(/USDT$/, ''));
  });

  it('should head each card with the figure it shows in front', () => {
    expect(card('coins').title).toMatch(new RegExp(`^${SYMBOLS.length} `));
    expect(card('timeframes').title).toMatch(new RegExp(`^${INTERVALS.length} `));
    expect(card('indicators').title).toMatch(new RegExp(`^${INDICATOR_CATALOG.length} `));
  });

  it('should keep every tour zoom cue inside its clip, in order, without overlapping', () => {
    for (const t of TOURS) {
      const length = CLIP_SECONDS[t.id]!;
      expect(length, t.id).toBeGreaterThan(0);
      t.zoom.forEach((z, i) => {
        const end = z.at + (z.hold ?? 1.4);
        expect(end, `${t.id} cue ${i}`).toBeLessThanOrEqual(length);
        const next = t.zoom[i + 1];
        if (next) expect(end, `${t.id} cue ${i}`).toBeLessThanOrEqual(next.at + 1e-9);
      });
    }
  });
});
