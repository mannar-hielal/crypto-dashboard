import type { GroupId } from '@/lib/landingContent';
import styles from './BrandMark.module.css';

/**
 * A heavily blurred, made-up "logo" for a competitor group: a generic shape and no letter, so it
 * hints at "a brand" without being one. No real logo, name or trademark is used (owner,
 * 2026-11-22). Decorative: the group's label next to it says who it is.
 */
export function BrandMark({ group }: { group: GroupId }) {
  return <span className={`${styles.mark} ${styles[group]}`} aria-hidden="true" />;
}
