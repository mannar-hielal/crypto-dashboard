import type { GroupId } from '@/lib/landingContent';
import styles from './BrandMark.module.css';

/**
 * A heavily blurred, made-up "logo" for a competitor group: a generic shape and no letter, so it
 * hints at "a brand" without being one. No real logo, name or trademark is used (owner,
 * 2026-11-22). Decorative: the group's label next to it says who it is.
 */
export function BrandMark({ group }: { group: GroupId }) {
  // The blur sits on the outer span and the shape (and its clip) on the inner one: a clip-path on the
  // blurred element itself would cut the blur off and leave crisp polygon edges
  return (
    <span className={styles.mark} aria-hidden="true">
      <span className={`${styles.shape} ${styles[group]}`} />
    </span>
  );
}
