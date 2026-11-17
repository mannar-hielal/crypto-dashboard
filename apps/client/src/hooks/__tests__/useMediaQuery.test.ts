import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

/** A matchMedia whose answer the test sets, telling its listeners */
function fakeMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  window.matchMedia = ((q: string) => ({
    get matches() {
      return matches;
    },
    media: q,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  })) as never;
  return {
    set(v: boolean, notify = true) {
      matches = v;
      if (notify) listeners.forEach((cb) => cb());
    },
  };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    // @ts-expect-error -- jsdom has no matchMedia: back to that
    delete window.matchMedia;
  });

  it('should give the fallback where there is no matchMedia', () => {
    expect(renderHook(() => useMediaQuery('(max-width: 1023px)', true)).result.current).toBe(true);
  });

  it('should follow the query as it changes', () => {
    const media = fakeMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 1023px)'));
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });

  it('should read the browser’s answer again on a render, even a change it wasn’t told of', () => {
    const media = fakeMedia(false);
    const { result, rerender } = renderHook(() => useMediaQuery('(max-width: 1023px)'));
    media.set(true, false); // crossed before any change event reached the hook
    rerender();
    expect(result.current).toBe(true);
  });
});
