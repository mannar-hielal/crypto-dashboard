import type { Feature } from '@/lib/landingContent';
import styles from './FeatureGrid.module.css';

interface FeatureGridProps {
  items: readonly Feature[];
  /** Number the cards 1, 2, 3 (steps) instead of leaving them plain */
  numbered?: boolean;
}

/** A grid of small cards: a short title and a plain sentence or two */
export function FeatureGrid({ items, numbered = false }: FeatureGridProps) {
  const List = numbered ? 'ol' : 'ul';
  return (
    <List className={styles.grid}>
      {items.map((f, i) => (
        <li key={f.title} className={styles.card}>
          {numbered && (
            <span className={styles.number} aria-hidden="true">
              {i + 1}
            </span>
          )}
          <h3 className={styles.title}>{f.title}</h3>
          <p className={styles.text}>{f.text}</p>
        </li>
      ))}
    </List>
  );
}
