import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import styles from './LessonPreviews.module.css';

type Previews = ComponentType<{ onReady?: () => void }>;

/** What the error boundary renders when the previews fail: it closes the holder's gap and offers a reload */
function FailedNote({ onFail }: { onFail: () => void }) {
  useEffect(onFail, [onFail]);
  const [reloading, setReloading] = useState(false);
  // After a deploy the old service worker can serve the old page, and its removed chunk again: ask it
  // to update first, but never wait more than a moment (a stalled network must not leave a dead button)
  const reload = () => {
    setReloading(true);
    const update =
      'serviceWorker' in navigator
        ? navigator.serviceWorker.getRegistration().then((r) => r?.update())
        : Promise.resolve();
    Promise.race([
      update.catch(() => undefined),
      new Promise((done) => setTimeout(done, 2500)),
    ]).then(() => window.location.reload());
  };
  return (
    // role="alert": a one-off failure a screen-reader user should hear when it appears
    <div role="alert" className={styles.failed}>
      <span>The lesson previews did not load.</span>
      <button type="button" className={styles.retry} disabled={reloading} onClick={reload}>
        {reloading ? 'Reloading…' : 'Reload the page'}
      </button>
    </div>
  );
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
 * section only: one note with a reload button.
 */
export function LessonPreviewsLazy() {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [Loaded, setLoaded] = useState<Previews | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [settled, setSettled] = useState(false);
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
      {near && (
        <ErrorBoundary fallback={<FailedNote onFail={markSettled} />}>
          <Slot Loaded={Loaded} error={loadError} onReady={markSettled} />
        </ErrorBoundary>
      )}
    </div>
  );
}
