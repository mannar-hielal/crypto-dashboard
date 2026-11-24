import { NOT_THIS } from '@/lib/howItWorksContent';
import styles from './NotCards.module.css';

/** A red stop sign with a white cross: the picture for "this app is not that" (drawn, decorative) */
function StopSign() {
  return (
    <svg className={styles.sign} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <polygon points="26,4 54,4 76,26 76,54 54,76 26,76 4,54 4,26" className={styles.octagon} />
      <polygon points="28,11 52,11 69,28 69,52 52,69 28,69 11,52 11,28" className={styles.rim} />
      <path d="M28 28l24 24M52 28L28 52" className={styles.cross} />
    </svg>
  );
}

/**
 * "What it is not" (owner 2026-11-24): four cards, each with a red stop sign, so the page says what
 * the app is not before a word is read. The sign shakes once on hover (none with reduced motion).
 */
export function NotCards() {
  return (
    <ul className={styles.grid}>
      {NOT_THIS.map((n) => (
        <li key={n.title} className={styles.card}>
          <StopSign />
          <div>
            <h3 className={styles.title}>{n.title}</h3>
            <p className={styles.text}>{n.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
