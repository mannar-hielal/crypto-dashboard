import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept current. Read through useSyncExternalStore, so the answer
 * is the browser's at every render and on subscribing: a width that crossed the query between the
 * first render and the subscription is never missed. `fallback` where the runtime has no matchMedia
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  // One MediaQueryList per query, read and listened to (never a new one each render)
  const mql = useMemo(
    () =>
      typeof window === 'undefined' || typeof window.matchMedia !== 'function'
        ? null
        : window.matchMedia(query),
    [query]
  );
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!mql) return () => {};
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [mql]
  );
  const read = () => (mql ? mql.matches : fallback);
  return useSyncExternalStore(subscribe, read, () => fallback);
}
