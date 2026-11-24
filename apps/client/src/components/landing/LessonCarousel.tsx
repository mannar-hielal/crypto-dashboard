import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

import { LessonArt } from '@/guide/LessonArt';
import { LESSON_PREVIEWS } from '@/lib/landingContent';
import styles from './LessonCarousel.module.css';

/**
 * The lessons as a carousel (owner 2026-11-24): arrows left and right, a dot for each lesson, one card
 * on a phone and more on a wider screen. A card opens the Crypto path (`/path`: signed in it opens the
 * map on the dashboard, signed out it asks for the sign-in first). The track is a plain scroll-snap
 * row, so a swipe, a trackpad and the keyboard all work; the arrows and dots drive the same scroll.
 * Heavy (the lessons' picture module), so the page loads it late, through `LessonPreviewsLazy`.
 */
export default function LessonCarousel({ onReady }: { onReady?: () => void }) {
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const last = LESSON_PREVIEWS.length - 1;
  const picked = useRef<number | null>(null);
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  // The active dot is the card at the left edge, or the last one once the row has scrolled to its end
  // (with several cards in view the row stops before the last cards reach the left edge)
  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement | undefined;
    if (!first) return;
    // With every card in view there is nothing to scroll: both arrows rest, and the first dot is lit
    const canScroll = el.scrollWidth > el.clientWidth + 2;
    const end = canScroll && el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    const step = first.offsetWidth + (parseFloat(getComputedStyle(el).columnGap) || 0);
    // The dot clicked last stays lit, through the smooth scroll and at the end of the row (which cannot bring
    // a late card to the left edge), until the visitor moves the row by hand; otherwise the card at the left
    const index = picked.current ?? (end ? last : Math.round(el.scrollLeft / Math.max(step, 1)));
    setActive(Math.max(0, Math.min(last, index)));
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(end || !canScroll);
  }, [last]);

  // Measure when the carousel appears, and again when its width changes (a rotated phone, a resized window)
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    onScroll();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onScroll]);

  const clearPick = () => {
    picked.current = null;
  };

  const behavior = (): ScrollBehavior =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  const goTo = (index: number) => {
    picked.current = index;
    const el = track.current;
    const card = el?.children[index] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: behavior() });
  };

  // The arrows move the row by one card from where it is (not to a card index: at the end of the row
  // the active dot is the last card, and a move to the one before it would go nowhere)
  const nudge = (dir: 1 | -1) => {
    const el = track.current;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !first) return;
    const step = first.offsetWidth + (parseFloat(getComputedStyle(el).columnGap) || 0);
    picked.current = null;
    el.scrollBy({ left: dir * step, behavior: behavior() });
  };

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-roledescription="carousel"
      aria-label="Lessons"
    >
      <button
        type="button"
        className={`${styles.arrow} ${styles.prev}`}
        onClick={() => !atStart && nudge(-1)}
        aria-disabled={atStart}
        aria-label="Previous lesson"
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <ul
        ref={track}
        className={styles.track}
        role="list"
        onScroll={onScroll}
        // The dot picked last stays lit at the end of the row until the visitor moves the row by hand
        onWheel={clearPick}
        onTouchStart={clearPick}
        onPointerDown={clearPick}
        onKeyDown={clearPick}
      >
        {LESSON_PREVIEWS.map((l) => (
          <li key={l.number} className={styles.slide}>
            <Link to="/path" className={styles.card}>
              <div className={styles.art}>
                <LessonArt id={l.art} center />
              </div>
              <p className={styles.number}>Lesson {l.number}</p>
              <h3 className={styles.title}>{l.title}</h3>
              <p className={styles.blurb}>{l.blurb}</p>
              <span className={styles.open}>Open the path</span>
            </Link>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={`${styles.arrow} ${styles.next}`}
        onClick={() => !atEnd && nudge(1)}
        aria-disabled={atEnd}
        aria-label="Next lesson"
      >
        <ChevronRight aria-hidden="true" />
      </button>
      <ol className={styles.dots} aria-label="Pick a lesson">
        {LESSON_PREVIEWS.map((l, i) => (
          <li key={l.number}>
            <button
              type="button"
              className={styles.dot}
              aria-label={`Lesson ${l.number}`}
              aria-current={i === active}
              onClick={() => goTo(i)}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
