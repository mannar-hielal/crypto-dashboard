import { Link } from 'react-router';
import { Check } from 'lucide-react';

import { PATH_CARDS } from '@/lib/landingContent';
import { guide } from '@/lib/guideAnchors';
import styles from './PathCards.module.css';

/** The hero's two big choices: the live chart (no sign up) and learning (free account) */
export function PathCards() {
  return (
    <div className={styles.cards}>
      {PATH_CARDS.map((card) => (
        <section
          key={card.id}
          className={`${styles.card} ${card.id === 'learn' ? styles.cardLearn : ''}`}
          aria-labelledby={`path-${card.id}`}
        >
          <span className={styles.badge}>{card.badge}</span>
          <h2 id={`path-${card.id}`} className={styles.title}>
            {card.title}
          </h2>
          <ul className={styles.bullets}>
            {card.bullets.map((b) => (
              <li key={b} className={styles.bullet}>
                <Check className={styles.tick} aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <Link
            to={card.cta.to}
            className={card.id === 'learn' ? styles.ctaPrimary : styles.ctaGhost}
            {...guide(card.anchor)}
          >
            {card.cta.label}
          </Link>
          {card.id === 'learn' && (
            <p className={styles.note}>
              Already have an account? <Link to="/login">Log in</Link>
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
