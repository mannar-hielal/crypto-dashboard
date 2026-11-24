import { ArrowLeft, ArrowUp } from 'lucide-react';

import { PRETEND_MONEY } from '@/lib/landingContent';
import panel from '@/assets/landing/pretend-panel.webp';
import panelNarrow from '@/assets/landing/pretend-panel-narrow.webp';
import reset from '@/assets/landing/pretend-reset.webp';
import styles from './PretendMoney.module.css';

/** A coin stamped PRETEND: the picture for "this money is not real" (drawn, decorative) */
function PretendCoin() {
  return (
    <svg className={styles.coin} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
      <circle cx="48" cy="48" r="42" className={styles.coinFace} />
      <circle cx="48" cy="48" r="34" className={styles.coinRing} />
      <text x="48" y="62" textAnchor="middle" className={styles.coinMark}>
        $
      </text>
      <g transform="rotate(-18 48 48)">
        <rect x="8" y="38" width="80" height="22" rx="4" className={styles.stamp} />
        <text x="48" y="54" textAnchor="middle" className={styles.stampText}>
          PRETEND
        </text>
      </g>
    </svg>
  );
}

/**
 * Where the pretend money lives (owner 2026-11-22): the account panel under the chart, zoomed, with
 * the balance picked out, a coin stamped PRETEND, and the reset dialog beside it.
 */
export function PretendMoney() {
  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <PretendCoin />
        <div>
          <h3 className={styles.title}>{PRETEND_MONEY.title}</h3>
          <p className={styles.text}>{PRETEND_MONEY.text}</p>
        </div>
      </div>
      <div className={styles.row}>
        <figure className={styles.panel}>
          <span className={styles.callout}>{PRETEND_MONEY.callout}</span>
          {/* A phone gets the left part of the panel (balance to available), big enough to read */}
          <picture>
            <source media="(max-width: 639px)" srcSet={panelNarrow} width={800} height={272} />
            <img
              src={panel}
              width={1000}
              height={170}
              alt={PRETEND_MONEY.panelAlt}
              loading="lazy"
              decoding="async"
              className={styles.panelImg}
            />
          </picture>
        </figure>
        <div className={styles.resetRow}>
          <figure className={styles.reset}>
            <img
              src={reset}
              width={360}
              height={300}
              alt={PRETEND_MONEY.resetAlt}
              loading="lazy"
              decoding="async"
              className={styles.resetImg}
            />
            <figcaption className={styles.resetText}>
              <strong>{PRETEND_MONEY.resetTitle}.</strong> {PRETEND_MONEY.resetText}
            </figcaption>
          </figure>
          {/* An arrow from the reset window to the post-it: it nudges toward the window */}
          <ArrowLeft className={`${styles.arrow} ${styles.arrowSide}`} aria-hidden="true" />
          <ArrowUp className={`${styles.arrow} ${styles.arrowUp}`} aria-hidden="true" />
          <div className={styles.postit}>
            <span className={styles.tape} aria-hidden="true" />
            <h4 className={styles.postTitle}>If you reset</h4>
            <p className={styles.postLabel}>You lose</p>
            <ul className={`${styles.postList} ${styles.lose}`}>
              {PRETEND_MONEY.resetLose.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className={styles.postLabel}>You keep</p>
            <ul className={`${styles.postList} ${styles.keep}`}>
              {PRETEND_MONEY.resetKeep.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
