import { GROUPS } from '@/lib/landingContent';
import { BrandMark } from './BrandMark';
import styles from './GroupSections.module.css';

/** Where we do better, one short section for each kind of competitor, each with an honest "they win" */
export function GroupSections() {
  return (
    <div className={styles.grid}>
      {GROUPS.map((g) => (
        <section key={g.id} className={styles.card} aria-labelledby={`group-${g.id}`}>
          <p className={styles.group}>
            <BrandMark group={g.id} />
            <span>Instead of: {g.label.toLowerCase()}</span>
          </p>
          <h3 id={`group-${g.id}`} className={styles.title}>
            {g.headline}
          </h3>
          <p className={styles.text}>{g.text}</p>
          <p className={styles.theyWin}>
            <strong>Where they are better.</strong> {g.theyWin}
          </p>
        </section>
      ))}
    </div>
  );
}
