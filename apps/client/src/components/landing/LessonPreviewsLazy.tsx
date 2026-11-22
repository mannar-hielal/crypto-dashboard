import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import styles from './LessonPreviews.module.css';

const LessonPreviews = lazy(() => import('./LessonPreviews'));

/**
 * Loads the lesson previews only when they come near the screen: the lessons' picture module is
 * large, and most visitors read the top of the page first. Without `IntersectionObserver` it
 * loads at once.
 */
export function LessonPreviewsLazy() {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');

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
    <div ref={holder} className={styles.holder}>
      {near && (
        <Suspense fallback={<div className={styles.placeholder} aria-hidden="true" />}>
          <LessonPreviews />
        </Suspense>
      )}
    </div>
  );
}
