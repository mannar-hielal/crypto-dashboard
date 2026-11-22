import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import styles from './LessonPreviews.module.css';

type Previews = ComponentType<{ onReady?: () => void }>;

/** What the error boundary renders when the previews fail: nothing itself, it only tells the holder */
function FailedMarker({ onFail }: { onFail: () => void }) {
  useEffect(onFail, [onFail]);
  return null;
}

/** The previews, a placeholder while the module loads, or the load error handed to the boundary */
function Slot({
  Loaded,
  error,
  onReady,
}: {
  Loaded: Previews | null;
  error: Error | null;
  onReady: () => void;
}) {
  // Thrown here so the one error boundary answers a failed import and a render error alike
  if (error) throw error;
  return Loaded ? (
    <Loaded onReady={onReady} />
  ) : (
    <div className={styles.placeholder} aria-hidden="true" />
  );
}

/**
 * Loads the lesson previews only when they come near the screen: the lessons' picture module is
 * large, and most visitors read the top of the page first. Without `IntersectionObserver` it
 * loads at once. A failure (offline, a stale chunk after a deploy, a picture that throws) costs this
 * section only: one plain note asking the visitor to refresh. A failed load stays failed until the
 * visitor refreshes, on purpose: a second import of a file a deploy removed would fail the same way.
 */
export function LessonPreviewsLazy() {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [Loaded, setLoaded] = useState<Previews | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [settled, setSettled] = useState(false);
  const [failed, setFailed] = useState(false);
  const markFailed = useCallback(() => {
    setFailed(true);
    setSettled(true);
  }, []);
  // Either the cards are in, or the section failed: the height reserved for them has done its job
  const markSettled = useCallback(() => setSettled(true), []);

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
      .catch((err: unknown) => {
        // Always an Error, so even a falsy rejection value trips the boundary
        if (live)
          setLoadError(err instanceof Error ? err : new Error('The lesson previews did not load'));
      });
    return () => {
      live = false;
    };
  }, [near]);

  return (
    <div ref={holder} className={`${styles.holder}${settled ? ` ${styles.holderSettled}` : ''}`}>
      {/* A live region that is always in the page and only gets its words when the previews fail, so a
          screen reader announces it (a region mounted with its text already in it is often silent). It
          is empty on purpose until a failure; copy this pattern only for a section that can fail. */}
      <p role="status" className={styles.failed}>
        {failed ? 'The lesson previews did not load. Refresh the page to try again.' : ''}
      </p>
      {near && (
        <ErrorBoundary fallback={<FailedMarker onFail={markFailed} />}>
          <Slot Loaded={Loaded} error={loadError} onReady={markSettled} />
        </ErrorBoundary>
      )}
    </div>
  );
}
