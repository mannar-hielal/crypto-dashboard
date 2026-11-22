import { useEffect } from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { LessonArt } from '@/guide/LessonArt';
import { LESSON_PREVIEWS } from '@/lib/landingContent';
import styles from './LessonPreviews.module.css';

// The exact complement of the CSS grid query (min-width: 768px), also at a fractional width
const PHONE_ROW = 'not all and (min-width: 768px)';

/**
 * A row of real lesson cards: each shows the lesson's own picture (the one in the lesson) with its
 * number, title and one line. It proves the learning side exists. Heavy (the lessons' picture
 * module), so the page loads it late, through `LessonPreviewsLazy`.
 */
export default function LessonPreviews({ onReady }: { onReady?: () => void }) {
  // The row scrolls sideways only on a phone: only there is it a labelled region and a keyboard stop.
  // (the browser floor in APP_LOG has matchMedia; without it the plain list is shown)
  const scrolls = useMediaQuery(PHONE_ROW);
  // Tells the holder the cards are in, so it can drop the height it reserved
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return (
    // Where the row scrolls sideways (a phone) the scroller is a labelled region and a tab stop; on a
    // wider screen it is a plain grid, so no landmark is added. The region ("Lesson previews") and the list ("Lessons") are named apart on purpose: the region is the scrolling box, the list is its content
    <div
      className={styles.scroller}
      {...(scrolls && {
        role: 'region',
        'aria-label': 'Lesson previews',
        tabIndex: 0,
      })}
    >
      <ul
        className={styles.row}
        // list-style: none drops list semantics in Safari: say it outright
        role="list"
        aria-label="Lessons" // one stable name at every width
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
