import { TIMELINE } from '@/lib/landingContent';
import styles from './Timeline.module.css';

/** What you get, as a short path of milestones: first click to first look-back */
export function Timeline() {
  return (
    <ol className={styles.list}>
      {TIMELINE.map((m, i) => (
        <li key={m.id} className={styles.item}>
          <span className={styles.dot} aria-hidden="true">
            {i + 1}
          </span>
          <div className={styles.body}>
            <h3 className={styles.title}>{m.title}</h3>
            <p className={styles.text}>{m.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
