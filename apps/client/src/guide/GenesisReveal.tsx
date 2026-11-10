/**
 * The birth of Bitcoin, staged (owner 2026-11-08): the two problems come in and fade back as the old
 * world, a real headline types in, drops into a block, and the block pulses and bursts out the
 * Bitcoin mark; then the caption and the summary's highlight. True: block 0, mined 3 January 2009,
 * carries that headline. Like `CardBeats`, a tap (or Enter, handled by the sheet) shows it all, the
 * scene says when it's over so Continue can show, and reduced motion shows the end at once. Every
 * word is always in the page (only transparent while hidden), the full headline included; a part
 * not shown yet is `inert`, so its Read more can't be tabbed to or clicked while invisible.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useReducedMotion, type Variants } from 'framer-motion';
import { CRYPTO_ICON_URLS } from '@/lib/cryptoIcons';
import { guide } from '@/lib/guideAnchors';
import type { Genesis } from './lessons';
import styles from './GenesisReveal.module.css';

// ─── The steps ───────────────────────────────────────────────────────────────

const POINT_1 = 1;
const POINT_2 = 2;
const DIM = 3;
const HEADLINE = 4;
const DROP = 5;
const BURST = 6;
const CAPTION = 7;
const HIGHLIGHT = 8;
export const GENESIS_LAST = HIGHLIGHT;

/** How long each step holds before the next (ms); the highlight's hold ends the scene */
const HOLD: Record<number, number> = {
  [POINT_1]: 900,
  [POINT_2]: 900,
  [DIM]: 800,
  [HEADLINE]: 1900,
  [DROP]: 900,
  [BURST]: 1300,
  [CAPTION]: 900,
  [HIGHLIGHT]: 600,
};
const TYPE_S = 1.5;

const lineVariants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
} as const;

/** The headline, as it lands in the block: smaller, a little lower */
const headlineVariants = {
  hidden: { opacity: 0, y: 0, scale: 1 },
  shown: { opacity: 1, y: 0, scale: 1 },
  dropped: { opacity: 0.85, y: 6, scale: 0.92, transition: { duration: 0.6, ease: 'easeIn' } },
} as const;

/** The block appears, then beats twice like a heart */
const blockVariants: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  shown: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 220, damping: 14 } },
  beat: {
    opacity: 1,
    scale: [1, 1.1, 1, 1.1, 1],
    transition: { duration: 1, ease: 'easeInOut' },
  },
};

const ringVariants: Variants = {
  hidden: { r: 18, opacity: 0 },
  burst: { r: 96, opacity: [0.9, 0], transition: { duration: 1.1, ease: 'easeOut' } },
  done: { r: 96, opacity: 0 },
};

const markVariants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 160, damping: 12 } },
} as const;

interface GenesisRevealProps {
  genesis: Genesis;
  /** The problem lines, each already with its Read more, keyed by its text */
  points: { key: string; node: ReactNode }[];
  /** The summary's highlight, the conclusion */
  highlight: ReactNode;
  /** Everything is shown (the scene ran out, was skipped, or the card was seen before) */
  done: boolean;
  onDone: () => void;
}

export function GenesisReveal({ genesis, points, highlight, done, onDone }: GenesisRevealProps) {
  const reduced = useReducedMotion();
  const still = done || !!reduced;
  const [step, setStep] = useState(still ? HIGHLIGHT : POINT_1);
  const at = still ? HIGHLIGHT : step;
  const [typed, setTyped] = useState(still ? genesis.headline.length : 0);

  // The latest callback, so a parent's new function each render doesn't restart the timers
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (done) return;
    if (reduced) {
      onDoneRef.current();
      return;
    }
    const timer = window.setTimeout(() => {
      if (step < HIGHLIGHT) setStep(step + 1);
      else onDoneRef.current();
    }, HOLD[step]);
    return () => window.clearTimeout(timer);
  }, [done, reduced, step]);

  // The headline types itself out, letter by letter
  const typing = !still && at === HEADLINE;
  useEffect(() => {
    if (!typing) return;
    const controls = animate(0, genesis.headline.length, {
      duration: TYPE_S,
      ease: 'linear',
      onUpdate: (n) => setTyped(Math.round(n)),
    });
    return () => controls.stop();
  }, [typing, genesis.headline.length]);

  const shownText = still || at > HEADLINE ? genesis.headline : genesis.headline.slice(0, typed);
  const initial = (state: string) => (still ? state : undefined);
  const dark = at >= DIM;

  return (
    <div
      className={styles.genesis}
      data-step={at}
      data-dark={dark}
      onClick={() => {
        if (!done) onDone();
      }}
      {...guide('lesson.genesis')}
    >
      <ol className={`${styles.points}${dark ? ` ${styles.pointsDim}` : ''}`}>
        {points.map((point, i) => (
          <motion.li
            key={point.key}
            variants={lineVariants}
            initial={initial('shown') ?? 'hidden'}
            animate={at >= POINT_1 + i ? 'shown' : 'hidden'}
            data-shown={at >= POINT_1 + i}
            inert={at < POINT_1 + i}
          >
            {point.node}
          </motion.li>
        ))}
      </ol>

      <motion.p
        className={styles.headline}
        variants={headlineVariants}
        initial={initial('dropped') ?? 'hidden'}
        animate={at >= DROP ? 'dropped' : at >= HEADLINE ? 'shown' : 'hidden'}
        data-shown={at >= HEADLINE}
      >
        <span className={styles.srOnly}>{genesis.headline}</span>
        <span aria-hidden="true">
          {shownText}
          {typing && <span className={styles.caret}>|</span>}
        </span>
      </motion.p>

      <svg viewBox="0 0 200 120" className={styles.scene} aria-hidden="true" focusable="false">
        <motion.circle
          cx="100"
          cy="60"
          className={styles.ring}
          variants={ringVariants}
          initial={initial('done') ?? 'hidden'}
          animate={still ? 'done' : at >= BURST ? 'burst' : 'hidden'}
        />
        <motion.g
          className={styles.block}
          variants={blockVariants}
          initial={initial('shown') ?? 'hidden'}
          animate={still ? 'shown' : at >= BURST ? 'beat' : at >= DROP ? 'shown' : 'hidden'}
          data-shown={at >= DROP}
        >
          <rect x="66" y="26" width="68" height="68" rx="14" className={styles.blockFace} />
          <motion.image
            href={CRYPTO_ICON_URLS.BTC}
            x="80"
            y="40"
            width="40"
            height="40"
            variants={markVariants}
            initial={initial('shown') ?? 'hidden'}
            animate={at >= BURST ? 'shown' : 'hidden'}
          />
        </motion.g>
      </svg>

      <motion.p
        className={styles.caption}
        variants={lineVariants}
        initial={initial('shown') ?? 'hidden'}
        animate={at >= CAPTION ? 'shown' : 'hidden'}
        data-shown={at >= CAPTION}
      >
        <strong className={styles.kicker}>{genesis.kicker}</strong> {genesis.caption}
      </motion.p>

      <motion.div
        variants={lineVariants}
        initial={initial('shown') ?? 'hidden'}
        animate={at >= HIGHLIGHT ? 'shown' : 'hidden'}
        data-shown={at >= HIGHLIGHT}
        inert={at < HIGHLIGHT}
      >
        {highlight}
      </motion.div>
    </div>
  );
}
