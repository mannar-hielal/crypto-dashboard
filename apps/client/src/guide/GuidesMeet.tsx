/**
 * The guides introduce themselves (owner 2026-10-25): Tick slides in from the left and says hi, Tock
 * slides in from the right and says hi, they meet in the middle with a small bump, then what the
 * lesson will answer fades in line by line. Like `CardBeats`, a tap (or Enter, handled by the sheet)
 * shows it all, the card says when it's over so Next can show, and reduced motion shows the end at
 * once. Every word is always in the page (only transparent while hidden) for screen readers.
 */

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { guide } from '@/lib/guideAnchors';
import { GuideFigure } from './art/Guide';
import type { GuidesMeeting } from './lessons';
import styles from './GuidesMeet.module.css';

// ─── The steps ───────────────────────────────────────────────────────────────

/** Tick in, his hi, Tock in, his hi, the bump, the lead line, then one step per list line */
const TICK_IN = 1;
const TICK_HI = 2;
const TOCK_IN = 3;
const TOCK_HI = 4;
const MEET = 5;
const LEAD = 6;

/** How long each step holds before the next one (ms): a slide takes longer than a line */
const HOLD: Record<number, number> = {
  [TICK_IN]: 650,
  [TICK_HI]: 350,
  [TOCK_IN]: 650,
  [TOCK_HI]: 350,
  [MEET]: 300,
  [LEAD]: 300,
};
export const LINE_MS = 220;

const slide = (from: string, lean: number): Variants => ({
  away: { x: from, opacity: 0 },
  in: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 140, damping: 16 } },
  // They meet: a lean toward each other and back
  met: { x: [0, lean, 0], opacity: 1, transition: { duration: 0.35, ease: 'easeOut' } },
});

const tickVariants = slide('-60vw', 8);
const tockVariants = slide('60vw', -8);

const bubbleVariants = {
  hidden: { opacity: 0, scale: 0.6, y: 6 },
  shown: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 18 },
  },
} as const;

const lineVariants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
} as const;

interface GuidesMeetProps {
  meet: GuidesMeeting;
  /** Everything is shown (the scene ran out, was skipped, or the card was seen before) */
  done: boolean;
  onDone: () => void;
}

export function GuidesMeet({ meet, done, onDone }: GuidesMeetProps) {
  const reduced = useReducedMotion();
  const last = LEAD + meet.list.length;
  const [step, setStep] = useState(done || reduced ? last : TICK_IN);
  const at = done || reduced ? last : step;
  const still = done || !!reduced;

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
      if (step < last) setStep(step + 1);
      else onDoneRef.current();
    }, HOLD[step] ?? LINE_MS);
    return () => window.clearTimeout(timer);
  }, [done, reduced, step, last]);

  const pose = (inStep: number) =>
    still ? 'in' : at >= MEET ? 'met' : at >= inStep ? 'in' : 'away';
  const initial = (state: string) => (still ? state : undefined);

  return (
    <div
      className={styles.meet}
      onClick={() => {
        if (!done) onDone();
      }}
      {...guide('lesson.meet')}
    >
      <div className={styles.stage}>
        <motion.div
          className={styles.guide}
          variants={tickVariants}
          initial={initial('in') ?? 'away'}
          animate={pose(TICK_IN)}
          data-shown={at >= TICK_IN}
        >
          <motion.p
            className={styles.bubble}
            variants={bubbleVariants}
            initial={initial('shown') ?? 'hidden'}
            animate={at >= TICK_HI ? 'shown' : 'hidden'}
            data-shown={at >= TICK_HI}
          >
            {meet.tick}
          </motion.p>
          <GuideFigure who="tick" mood="smile" pose="wave" className={styles.figure} />
        </motion.div>
        <motion.div
          className={styles.guide}
          variants={tockVariants}
          initial={initial('in') ?? 'away'}
          animate={pose(TOCK_IN)}
          data-shown={at >= TOCK_IN}
        >
          <motion.p
            className={styles.bubble}
            variants={bubbleVariants}
            initial={initial('shown') ?? 'hidden'}
            animate={at >= TOCK_HI ? 'shown' : 'hidden'}
            data-shown={at >= TOCK_HI}
          >
            {meet.tock}
          </motion.p>
          <GuideFigure who="tock" mood="smile" pose="wave" className={styles.figure} />
        </motion.div>
      </div>

      <motion.p
        className={styles.lead}
        variants={lineVariants}
        initial={initial('shown') ?? 'hidden'}
        animate={at >= LEAD ? 'shown' : 'hidden'}
        data-shown={at >= LEAD}
      >
        {meet.lead}
      </motion.p>
      <ul className={styles.list}>
        {meet.list.map((item, i) => (
          <motion.li
            key={item}
            variants={lineVariants}
            initial={initial('shown') ?? 'hidden'}
            animate={at > LEAD + i ? 'shown' : 'hidden'}
            data-shown={at > LEAD + i}
          >
            <Check size={16} aria-hidden="true" className={styles.tick} />
            {item}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
