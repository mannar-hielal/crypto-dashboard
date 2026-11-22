import type { ReactNode } from 'react';

import styles from './landing.module.css';

interface SectionHeadProps {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  /** The page's own title is an h1; sections use h2 */
  as?: 'h1' | 'h2';
}

/** The heading block that opens a section: small label, title, one line of lead */
export function SectionHead({ id, eyebrow, title, lead, as: Tag = 'h2' }: SectionHeadProps) {
  return (
    <div className={styles.head}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <Tag id={id} className={styles.title}>
        {title}
      </Tag>
      {lead && <p className={styles.lead}>{lead}</p>}
    </div>
  );
}
