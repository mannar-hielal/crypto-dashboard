import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import styles from './LessonPreviews.module.css';

type Previews = ComponentType<{ onReady?: () => void }>;

/**
 * Reload, after asking the service worker (the app's offline shell) to update first: an old worker
 * would otherwise serve the old page and the same missing chunk again
 */
function reloadFresh() {
  const reload = () => window.location.reload();
  if (!('serviceWorker' in navigator)) return reload();
  navigator.serviceWorker
    .getRegistration()
    .then((registration) => registration?.update())
    .catch(() => undefined)
    .finally(reload);
}

/**
 * What the failure fallbacks render: it tells the holder to close its gap, and offers a reload. A
 * reload, not a second import: after a deploy the old hashed file is gone, and asking for the same
 * URL again would fail the same way
 */
function FailedNote({ onFail }: { onFail: () => void }) {
  useEffect(onFail, [onFail]);
  return (
    <button type="button" className={styles.retry} onClick={reloadFresh}>
      The lesson previews did not load. Reload the page
    </button>
  );
}

/**
 * Loads the lesson previews only when they come near the screen: the lessons' picture module is
 * large, and most visitors read the top of the page first. Without `IntersectionObserver` it
 * loads at once. A failed import (offline, or a stale chunk after a deploy) costs this section only.
 */
export function LessonPreviewsLazy() {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [Loaded, setLoaded] = useState<Previews | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const markFailed = useCallback(() => setFailed(true), []);
  const markReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const el = holder.current;
    if (near || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  // The import, once the row is near
  useEffect(() => {
    if (!near) return;
    let live = true;
    import('./LessonPreviews')
      .then((m) => {
        if (live) setLoaded(() => m.default);
      })
      .catch(() => {
        // A failed chunk (offline, or a stale hashed file after a deploy) costs this section only
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [near]);

  return (
    <div
      ref={holder}
      className={`${styles.holder}${failed || ready ? ` ${styles.holderSettled}` : ''}`}
    >
      {failed ? (
        <FailedNote onFail={markFailed} />
      ) : (
        near &&
        (Loaded ? (
          // A render error inside the row (a picture that throws) lands here too
          <ErrorBoundary fallback={<FailedNote onFail={markFailed} />}>
            <Loaded onReady={markReady} />
          </ErrorBoundary>
        ) : (
          <div className={styles.placeholder} aria-hidden="true" />
        ))
      )}
    </div>
  );
}
