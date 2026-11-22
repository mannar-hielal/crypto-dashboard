import type { Feature } from '@/lib/landingContent';
import styles from './FeatureGrid.module.css';

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
        <li key={f.title} className={styles.card}>
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
