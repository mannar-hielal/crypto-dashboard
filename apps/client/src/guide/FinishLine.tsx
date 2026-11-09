/**
 * The end of a lesson (owner 2026-11-08: not a cup): Pulin and Berwyn run in and break the finish
 * ribbon, its halves swing down, the flag waves and a little confetti falls. About 1.5 s; a tap shows
 * the end, and reduced motion shows it at once. Decorative: the heading says the lesson is done.
 */

import { useEffect, useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { guide } from '@/lib/guideAnchors';
import { Guide } from './art/Guide';
import styles from './FinishLine.module.css';

/** start: the runners on their way; broken: the ribbon snaps; done: everything settled */
type Stage = 'start' | 'broken' | 'done';
const BREAK_MS = 750;
const SETTLE_MS = 900;

/** The ribbon crosses the track here; the runners stop past it */
const FINISH_X = 214;
const RUN_FROM = -70;
const RUN_TO = 236;

const runnerVariants = {
  start: { x: RUN_FROM },
  run: { x: RUN_TO, transition: { duration: 0.95, ease: 'easeIn' } },
  end: { x: RUN_TO },
} as const;

/**
 * Pushed forward by the runners: the top half swings from its knot at the top, the bottom half from
 * its foot on the ground (the pivot is set with the rotation, so framer keeps it)
 */
const topHalf = {
  whole: { rotate: 0, originX: 0.5, originY: 0 },
  snapped: {
    rotate: -70,
    originX: 0.5,
    originY: 0,
    transition: { type: 'spring', stiffness: 120, damping: 9 },
  },
} as const;
const bottomHalf = {
  whole: { rotate: 0, originX: 0.5, originY: 1 },
  snapped: {
    rotate: 75,
    originX: 0.5,
    originY: 1,
    transition: { type: 'spring', stiffness: 120, damping: 9 },
  },
} as const;

const flagVariants: Variants = {
  still: { skewY: 0 },
  wave: { skewY: [0, -8, 6, -4, 0], transition: { duration: 0.9, ease: 'easeInOut' } },
};

/** A few pieces of confetti, in brand colours; where each lands is fixed, so every run looks alike */
const CONFETTI = [
  { x: 150, y: 70, tone: 'purple', r: 30 },
  { x: 172, y: 92, tone: 'amber', r: -20 },
  { x: 190, y: 62, tone: 'pink', r: 45 },
  { x: 236, y: 84, tone: 'green', r: -35 },
  { x: 258, y: 66, tone: 'amber', r: 15 },
  { x: 276, y: 94, tone: 'purple', r: -50 },
  { x: 296, y: 74, tone: 'pink', r: 25 },
  { x: 130, y: 96, tone: 'green', r: 60 },
] as const;

export function FinishLine() {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<Stage>(reduced ? 'done' : 'start');
  const shown: Stage = reduced ? 'done' : stage;

  useEffect(() => {
    if (reduced || stage === 'done') return;
    const timer = window.setTimeout(
      () => setStage(stage === 'start' ? 'broken' : 'done'),
      stage === 'start' ? BREAK_MS : SETTLE_MS
    );
    return () => window.clearTimeout(timer);
  }, [reduced, stage]);

  const still = shown === 'done';
  const snapped = shown !== 'start';
  return (
    <div
      className={styles.finish}
      data-state={shown}
      onClick={() => setStage('done')}
      {...guide('lesson.finish-line')}
    >
      <svg viewBox="0 0 320 120" className={styles.scene} aria-hidden="true" focusable="false">
        {/* The track */}
        <line x1="0" y1="106" x2="320" y2="106" className={styles.ground} />
        <line x1="0" y1="114" x2="320" y2="114" className={styles.lane} />

        {/* The finish: a pole with the checkered flag, and the ribbon across the track */}
        <line x1={FINISH_X + 8} y1="12" x2={FINISH_X + 8} y2="106" className={styles.pole} />
        <motion.g
          className={styles.flag}
          variants={flagVariants}
          initial="still"
          animate={snapped && !still ? 'wave' : 'still'}
        >
          {[0, 1, 2, 3].map((col) =>
            [0, 1, 2].map((row) => (
              <rect
                key={`${col}-${row}`}
                x={FINISH_X + 9 + col * 7}
                y={12 + row * 6}
                width="7"
                height="6"
                className={(col + row) % 2 === 0 ? styles.checkDark : styles.checkLight}
              />
            ))
          )}
        </motion.g>
        <motion.line
          x1={FINISH_X}
          y1="44"
          x2={FINISH_X}
          y2="75"
          className={`${styles.ribbon} ${styles.ribbonTop}`}
          variants={topHalf}
          initial={still ? 'snapped' : 'whole'}
          animate={snapped ? 'snapped' : 'whole'}
        />
        <motion.line
          x1={FINISH_X}
          y1="75"
          x2={FINISH_X}
          y2="106"
          className={`${styles.ribbon} ${styles.ribbonBottom}`}
          variants={bottomHalf}
          initial={still ? 'snapped' : 'whole'}
          animate={snapped ? 'snapped' : 'whole'}
        />

        {/* Pulin and Berwyn, side by side, running through it */}
        <motion.g
          variants={runnerVariants}
          initial={still ? 'end' : 'start'}
          animate={still ? 'end' : 'run'}
        >
          <Guide who="tick" mood="grin" pose="wave" x={0} y={52} scale={0.55} />
          <Guide who="tock" mood="grin" pose="wave" x={30} y={56} scale={0.55} />
        </motion.g>

        {/* Confetti, once the ribbon breaks */}
        {CONFETTI.map((c, i) => (
          <motion.rect
            key={`${c.x}-${c.y}`}
            x={c.x}
            y={0}
            width="5"
            height="8"
            rx="1"
            className={styles[c.tone]}
            initial={
              still ? { y: c.y, rotate: c.r, opacity: 1 } : { y: -12, rotate: 0, opacity: 0 }
            }
            animate={
              snapped
                ? {
                    y: c.y,
                    rotate: c.r,
                    opacity: 1,
                    transition: { duration: 0.8, delay: i * 0.05 },
                  }
                : { y: -12, rotate: 0, opacity: 0 }
            }
          />
        ))}
      </svg>
    </div>
  );
}
