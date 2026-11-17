import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept current. Read through useSyncExternalStore, so the answer
 * is the browser's at every render and on subscribing: a width that crossed the query between the
 * first render and the subscription is never missed. `fallback` where the runtime has no matchMedia
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );
  const read = () =>
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? fallback
      : window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, read, () => fallback);
}
