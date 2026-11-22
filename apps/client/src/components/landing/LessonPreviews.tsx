import { useEffect, useState } from 'react';

import { LessonArt } from '@/guide/LessonArt';
import { LESSON_PREVIEWS } from '@/lib/landingContent';
import styles from './LessonPreviews.module.css';

const PHONE_ROW = '(max-width: 767px)';

/** The row scrolls sideways only on a phone: only there is it a stop for the keyboard */
function useScrollingRow() {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [scrolls, setScrolls] = useState(() =>
    supported ? window.matchMedia(PHONE_ROW).matches : false
  );
  useEffect(() => {
    if (!supported) return;
    const query = window.matchMedia(PHONE_ROW);
    const update = () => setScrolls(query.matches);
    // Older Safari (before 14) has addListener only
    if (query.addEventListener) {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, [supported]);
  return scrolls;
}

/**
 * A row of real lesson cards: each shows the lesson's own picture (the one in the lesson) with its
 * number, title and one line. It proves the learning side exists. Heavy (the lessons' picture
 * module), so the page loads it late, through `LessonPreviewsLazy`.
 */
export default function LessonPreviews({ onReady }: { onReady?: () => void }) {
  const scrolls = useScrollingRow();
  // Tells the holder the cards are in, so it can drop the height it reserved
  useEffect(() => onReady?.(), [onReady]);
  return (
    // Where the row scrolls sideways (a phone) the scroller is a labelled region and a tab stop; on a
    // wider screen it is a plain grid, so the list carries the name and no landmark is added
    <div
      className={styles.scroller}
      {...(scrolls && { role: 'region', 'aria-label': 'A peek at the lessons', tabIndex: 0 })}
    >
      <ul
        className={styles.row}
        // list-style: none drops list semantics in Safari: say it outright
        role="list"
        {...(!scrolls && { 'aria-label': 'A peek at the lessons' })}
      >
        {LESSON_PREVIEWS.map((l) => (
          <li key={l.number} className={styles.card}>
            <div className={styles.art}>
              <LessonArt id={l.art} />
            </div>
            <p className={styles.number}>Lesson {l.number}</p>
            <h3 className={styles.title}>{l.title}</h3>
            <p className={styles.blurb}>{l.blurb}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
