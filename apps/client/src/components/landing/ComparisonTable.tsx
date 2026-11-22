import { Check, Minus, X } from 'lucide-react';

import { GROUPS, SMALL_ON_PURPOSE, TABLE_NOTE, TABLE_ROWS, type Mark } from '@/lib/landingContent';
import { BrandMark } from './BrandMark';
import styles from './ComparisonTable.module.css';

const WORDS: Record<Mark, string> = { yes: 'Yes', some: 'Sometimes', no: 'No' };
const ICON: Record<Mark, typeof Check> = { yes: Check, some: Minus, no: X };

/** A tick, a tilde or a cross, with its word for screen readers: colour is never the only cue */
function Cell({ mark, us }: { mark: Mark; us?: boolean }) {
  const Icon = ICON[mark];
  return (
    <td className={`${styles.cell}${us ? ` ${styles.us}` : ''}`}>
      <span className={`${styles.mark} ${styles[mark]}`} data-mark={mark}>
        <Icon className={styles.icon} aria-hidden="true" />
        <span className={styles.word}>{WORDS[mark]}</span>
      </span>
    </td>
  );
}

/**
 * Our app against the six groups of competitors (never brand names): only what is live today.
 * Rows where we lose are marked "on purpose". The table scrolls inside its own box on a phone, with
 * the feature column pinned.
 */
export function ComparisonTable() {
  return (
    <div className={styles.wrap}>
      <div className={styles.scroller} tabIndex={0} role="region" aria-label="Comparison table">
        <table className={styles.table}>
          <caption className={styles.caption}>
            What this app does, next to six kinds of practice tools
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.featureHead}>
                <span className={styles.srOnly}>Feature</span>
              </th>
              <th scope="col" className={`${styles.head} ${styles.usHead}`}>
                <span className={styles.usMark} aria-hidden="true">
                  CPT
                </span>
                <span className={styles.label}>cryptopapertrade</span>
              </th>
              {GROUPS.map((g) => (
                <th key={g.id} scope="col" className={styles.head}>
                  <BrandMark group={g.id} />
                  <span className={styles.label}>{g.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TABLE_ROWS.map((row) => (
              <tr key={row.id} className={row.deliberate ? styles.deliberate : undefined}>
                <th scope="row" className={styles.feature}>
                  {row.feature}
                  {row.deliberate && <span className={styles.tag}>small on purpose</span>}
                </th>
                <Cell mark={row.us} us />
                {row.groups.map((m, i) => (
                  <Cell key={GROUPS[i]?.id ?? i} mark={m} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>{SMALL_ON_PURPOSE}</p>
      <p className={styles.note}>{TABLE_NOTE}</p>
    </div>
  );
}
