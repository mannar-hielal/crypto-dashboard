import type { Feature, FeatureShot } from '@/lib/landingContent';
import timeframes from '@/assets/landing/feat-timeframes.webp';
import indicators from '@/assets/landing/feat-indicators.webp';
import drawing from '@/assets/landing/feat-drawing.webp';
import layouts from '@/assets/landing/feat-layout-menu.webp';
import live from '@/assets/landing/feat-live.webp';
import styles from './FeatureGrid.module.css';

// Real captures of the app's chart (Playwright, 2026-11-22), cropped, 720 px wide WebP. Their sizes are
// the images' own, so a card never jumps while its picture loads
const SHOTS: Record<FeatureShot, { src: string; width: number; height: number }> = {
  timeframes: { src: timeframes, width: 720, height: 655 },
  indicators: { src: indicators, width: 720, height: 506 },
  drawing: { src: drawing, width: 720, height: 582 },
  layouts: { src: layouts, width: 720, height: 480 },
  live: { src: live, width: 720, height: 297 },
};

interface FeatureGridProps {
  items: readonly Feature[];
  /** Number the cards 1, 2, 3 (steps) instead of leaving them plain */
  numbered?: boolean;
  /** The cards' heading level: 4 when the grid sits under an h3 sub-heading */
  headingLevel?: 3 | 4;
}

/** A grid of small cards: a short title and a plain sentence or two */
export function FeatureGrid({ items, numbered = false, headingLevel = 3 }: FeatureGridProps) {
  const List = numbered ? 'ol' : 'ul';
  const Heading = `h${headingLevel}` as 'h3' | 'h4';
  return (
    <List className={styles.grid}>
      {items.map((f, i) => (
        <li key={f.title} className={`${styles.card}${f.shot ? ` ${styles.withShot}` : ''}`}>
          {f.shot && (
            // A faded crop of the real app behind the card's right side: decorative (the text says it all)
            <img
              className={styles.shot}
              src={SHOTS[f.shot].src}
              width={SHOTS[f.shot].width}
              height={SHOTS[f.shot].height}
              alt=""
              loading="lazy"
              decoding="async"
            />
          )}
          {numbered && (
            <span className={styles.number} aria-hidden="true">
              {i + 1}
            </span>
          )}
          <Heading className={styles.title}>{f.title}</Heading>
          <p className={styles.text}>{f.text}</p>
        </li>
      ))}
    </List>
  );
}
