import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTourWide } from '@/guide/useTourWide';
import { isWideScreen } from '@/guide/tours';

describe('useTourWide', () => {
  afterEach(() => {
    // @ts-expect-error -- jsdom has no matchMedia: back to that
    delete window.matchMedia;
  });

  it('should count as desktop without matchMedia, as the tour store does', () => {
    expect(renderHook(() => useTourWide()).result.current).toBe(true);
    expect(isWideScreen()).toBe(true);
  });

  it('should follow the tours’ width when the browser can say', () => {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as never;
    expect(renderHook(() => useTourWide()).result.current).toBe(false);
    expect(isWideScreen()).toBe(false);
  });
});
