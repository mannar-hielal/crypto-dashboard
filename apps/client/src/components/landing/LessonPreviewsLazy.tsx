import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import styles from './LessonPreviews.module.css';

const LessonPreviews = lazy(() => import('./LessonPreviews'));

/** What the error boundary renders: nothing, and it tells the holder to close its reserved gap */
function FailedMarker({ onFail }: { onFail: () => void }) {
  useEffect(onFail, [onFail]);
  return null;
}

/**
 * Loads the lesson previews only when they come near the screen: the lessons' picture module is
 * large, and most visitors read the top of the page first. Without `IntersectionObserver` it
 * loads at once.
 */
export function LessonPreviewsLazy() {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [failed, setFailed] = useState(false);
  const markFailed = useCallback(() => setFailed(true), []);
  const [ready, setReady] = useState(false);
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

  return (
    <div
      ref={holder}
      className={`${styles.holder}${failed || ready ? ` ${styles.holderSettled}` : ''}`}
    >
      {near && (
        // A failed chunk (offline, or a stale hashed file after a deploy) costs this section, never the page
        <ErrorBoundary fallback={<FailedMarker onFail={markFailed} />}>
          <Suspense fallback={<div className={styles.placeholder} aria-hidden="true" />}>
            <LessonPreviews onReady={markReady} />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
