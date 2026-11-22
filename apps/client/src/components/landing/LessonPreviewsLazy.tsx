import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import styles from './LessonPreviews.module.css';

type Previews = ComponentType<{ onReady?: () => void }>;

/** What the failure fallbacks render: it tells the holder to close its gap, and offers a retry */
function FailedNote({ onFail, onRetry }: { onFail: () => void; onRetry: () => void }) {
  useEffect(onFail, [onFail]);
  return (
    <button type="button" className={styles.retry} onClick={onRetry}>
      The lesson previews did not load. Try again
    </button>
  );
}

/**
 * Loads the lesson previews only when they come near the screen: the lessons' picture module is
 * large, and most visitors read the top of the page first. Without `IntersectionObserver` it
 * loads at once. The module is imported by hand (not `React.lazy`, which would cache a failed
 * import for good), so a failure costs this section only and a retry imports it again.
 */
export function LessonPreviewsLazy() {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [Loaded, setLoaded] = useState<Previews | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const markFailed = useCallback(() => setFailed(true), []);
  const markReady = useCallback(() => setReady(true), []);
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((a) => a + 1);
  }, []);

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

  // The import: when the row is near, and again on each retry
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
  }, [near, attempt]);

  return (
    <div
      ref={holder}
      className={`${styles.holder}${failed || ready ? ` ${styles.holderSettled}` : ''}`}
    >
      {failed ? (
        <FailedNote onFail={markFailed} onRetry={retry} />
      ) : (
        near &&
        (Loaded ? (
          // A render error inside the row (a picture that throws) lands here too
          <ErrorBoundary
            key={attempt}
            fallback={<FailedNote onFail={markFailed} onRetry={retry} />}
          >
            <Loaded onReady={markReady} />
          </ErrorBoundary>
        ) : (
          <div className={styles.placeholder} aria-hidden="true" />
        ))
      )}
    </div>
  );
}
