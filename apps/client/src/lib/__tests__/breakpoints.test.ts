import { afterEach, describe, expect, it } from 'vitest';
import { isNarrowNow, NARROW_LAYOUT_QUERY, WIDE_LAYOUT_QUERY } from '@/lib/breakpoints';

describe('breakpoints', () => {
  it('should make the wide layout exactly the widths the narrow one leaves (no gap at 1023.5 px)', () => {
    // Written as the narrow query's negation, so a fractional width (browser zoom) is always one
    expect(WIDE_LAYOUT_QUERY).toBe(`not all and ${NARROW_LAYOUT_QUERY}`);
    expect(NARROW_LAYOUT_QUERY).toBe('(max-width: 1023px)');
  });
});

describe('isNarrowNow', () => {
  afterEach(() => {
    // @ts-expect-error -- jsdom has no matchMedia: back to that
    delete window.matchMedia;
  });

  it('should be false where the runtime has no matchMedia', () => {
    expect(isNarrowNow()).toBe(false);
  });

  it('should follow the narrow layout query', () => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as never;
    expect(isNarrowNow()).toBe(true);
  });
});
