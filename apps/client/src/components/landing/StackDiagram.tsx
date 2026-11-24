import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  STACK,
  STACK_LINKS,
  STACK_TECH,
  WORDS_PICTURED,
  type StackLayer,
} from '@/lib/howItWorksContent';
import { TechLogos } from './TechLogos';
import styles from './StackDiagram.module.css';

// One small line drawing per layer, in the layer's colour (currentColor)
const PICTURES: Record<StackLayer['id'], ReactNode> = {
  browser: (
    <svg viewBox="0 0 160 110" aria-hidden="true" focusable="false">
      <rect x="8" y="8" width="144" height="94" rx="9" />
      <path d="M8 28h144" />
      <circle cx="22" cy="18" r="3" />
      <circle cx="34" cy="18" r="3" />
      <circle cx="46" cy="18" r="3" />
      <path d="M22 86l16-18 14 10 18-26 16 14 20-22 16 12" />
      <rect x="112" y="40" width="30" height="14" rx="7" />
    </svg>
  ),
  server: (
    <svg viewBox="0 0 160 110" aria-hidden="true" focusable="false">
      <rect x="22" y="8" width="116" height="26" rx="6" />
      <rect x="22" y="42" width="116" height="26" rx="6" />
      <rect x="22" y="76" width="116" height="26" rx="6" />
      <circle cx="40" cy="21" r="3.5" />
      <circle cx="40" cy="55" r="3.5" />
      <circle cx="40" cy="89" r="3.5" />
      <path d="M62 21h56M62 55h56M62 89h56" />
    </svg>
  ),
  database: (
    <svg viewBox="0 0 160 110" aria-hidden="true" focusable="false">
      <ellipse cx="80" cy="22" rx="48" ry="14" />
      <path d="M32 22v66c0 8 21 14 48 14s48-6 48-14V22" />
      <path d="M32 55c0 8 21 14 48 14s48-6 48-14" />
    </svg>
  ),
  feed: (
    <svg viewBox="0 0 160 110" aria-hidden="true" focusable="false">
      <path d="M80 100V50" />
      <path d="M62 100h36" />
      <circle cx="80" cy="42" r="7" />
      <path d="M62 30a26 26 0 0 0 0 24M98 30a26 26 0 0 1 0 24" />
      <path d="M48 18a46 46 0 0 0 0 48M112 18a46 46 0 0 1 0 48" />
    </svg>
  ),
};

function Layer({ layer }: { layer: StackLayer }) {
  const words = layer.words
    .map((t) => WORDS_PICTURED.find((w) => w.title === t))
    .filter((w) => w !== undefined);
  return (
    <section
      className={`${styles.layer} ${styles[layer.id]}`}
      aria-labelledby={`stack-${layer.id}`}
    >
      <header className={styles.layerHead}>
        <h3 id={`stack-${layer.id}`} className={styles.layerTitle}>
          {layer.title}
        </h3>
        <span className={styles.tag}>{layer.tag}</span>
      </header>
      <TechLogos names={STACK_TECH[layer.id]} />
      <div className={styles.layerBody}>
        <div className={styles.copy}>
          <p className={styles.text}>{layer.text}</p>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt className={`${styles.pill} ${styles.pillDoes}`}>Does</dt>
              <dd>{layer.does}</dd>
            </div>
            <div className={styles.fact}>
              <dt className={`${styles.pill} ${styles.pillWithout}`}>Without it</dt>
              <dd>{layer.without}</dd>
            </div>
          </dl>
        </div>
        <div className={styles.picture}>{PICTURES[layer.id]}</div>
        {words.length > 0 && (
          <ul className={styles.words}>
            {words.map((w) => (
              <li key={w.title} className={styles.word}>
                <h4 className={styles.wordTitle}>{w.title}</h4>
                <p className={styles.wordText}>{w.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** A road between two layers: a dashed line that carries the labels of what travels on it */
function Link({
  children,
  label,
  direction = 'down',
}: {
  children?: ReactNode;
  label: string;
  /** Which way the dashes stream: down to the next layer, or up from the feed */
  direction?: 'down' | 'up';
}) {
  return (
    <div
      className={`${styles.link}${direction === 'up' ? ` ${styles.linkUp}` : ''}`}
      role="group"
      aria-label={label}
    >
      <span className={styles.linkLine} aria-hidden="true" />
      <ArrowUp className={`${styles.linkArrow} ${styles.arrowTop}`} aria-hidden="true" />
      <ArrowDown className={`${styles.linkArrow} ${styles.arrowBottom}`} aria-hidden="true" />
      {children}
    </div>
  );
}

/**
 * The architect picture of the system (owner 2026-11-23, in the style of a layered stack poster): the
 * browser on top, the server under it, the database and the live price feed at the bottom, each layer
 * in its own colour with what it does and what would be missing without it, roads between the layers
 * and a one-line guide underneath. Everything is HTML and inline line drawings (no image file).
 */
export function StackDiagram() {
  const [browser, server, database, feed] = STACK;
  const links = STACK_LINKS.map((t) => WORDS_PICTURED.find((w) => w.title === t)).filter(
    (w) => w !== undefined
  );
  return (
    <div className={styles.stack}>
      <Layer layer={browser} />
      <Link label="Between your browser and the server">
        <ul className={styles.roads}>
          {links.map((w) => (
            <li key={w.title} className={styles.road}>
              <strong>{w.title}</strong>
              <span>{w.text}</span>
            </li>
          ))}
        </ul>
      </Link>
      <Layer layer={server} />
      <div className={styles.pair}>
        <div className={styles.half}>
          <Link label="Between the server and the database">
            <span className={styles.roadLabel}>Saves and reads</span>
          </Link>
          <Layer layer={database} />
        </div>
        <div className={styles.half}>
          <Link label="Between the live price feed and the server" direction="up">
            <span className={styles.roadLabel}>Prices come in</span>
          </Link>
          <Layer layer={feed} />
        </div>
      </div>

      <div className={styles.guide} aria-label="The four parts in one line">
        <span className={styles.guideLabel}>Quick guide</span>
        <ol className={styles.guideList}>
          {STACK.map((l, i) => (
            <li key={l.id} className={`${styles.chip} ${styles[l.id]}`}>
              {l.title}
              {i < STACK.length - 1 && (
                <ArrowRight className={styles.chipArrow} aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
