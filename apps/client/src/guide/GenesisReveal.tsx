/**
 * The birth of Bitcoin, staged on Lesson 1's summary (owner 2026-11-12): the two problems come in,
 * then fade away as the stage goes dark; each line of the story fades in and out in turn; then the
 * Bitcoin mark rises in the middle with a burst, and the summary's highlight ("That was the birth of
 * Bitcoin.") lands under it. Like `CardBeats`, a tap (or Enter, handled by the sheet) shows the end,
 * and the scene says when it's over so Continue can show. With reduced motion nothing moves: the
 * problems, the story and the end are all shown at once, one under another (review 2026-11-12).
 * Otherwise everything shares one stage cell, so nothing jumps as one part replaces another. Every
 * word is always in the page: the whole story is read out once (`srOnly`), and a part not on screen
 * is `inert` and hidden from screen readers, so its Read more can't be reached while invisible.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { CRYPTO_ICON_URLS } from '@/lib/cryptoIcons';
import { guide } from '@/lib/guideAnchors';
import { emphasize } from './emphasize';
import type { BirthStory } from './lessons';
import styles from './GenesisReveal.module.css';

// ─── The steps ───────────────────────────────────────────────────────────────

/**
 * The steps of a summary with `p` problems and `n` story lines: each problem (1…p), the clear (the
 * problems fade and the stage goes dark), each story line, the mark, then the end line. Worked out
 * from the counts, so a third problem gets its own turn (review 2026-11-12)
 */
function genesisSteps(p: number, n: number) {
  const clear = p + 1;
  const line1 = clear + 1;
  const mark = line1 + n;
  return { clear, line1, mark, end: mark + 1 };
}

/** Time enough to read a line of `chars` characters (ms) */
const readFor = (chars: number) => 1200 + chars * 26;

/**
 * How long a step holds before the next (ms): a problem or a story line by its length (review
 * 2026-11-12: the problems are the longest lines, so they get the most time)
 */
function holdFor(
  step: number,
  points: readonly string[],
  lines: BirthStory['lines'],
  steps: ReturnType<typeof genesisSteps>
): number {
  if (step < steps.clear) return readFor(points[step - 1].length);
  if (step === steps.clear) return 700;
  if (step < steps.mark) return readFor(lines[step - steps.line1].text.length);
  if (step === steps.mark) return 1300;
  return 600;
}

const lineVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
  gone: { opacity: 0, y: -8, transition: { duration: 0.4, ease: 'easeIn' } },
};

const ringVariants: Variants = {
  hidden: { r: 18, opacity: 0 },
  burst: { r: 96, opacity: [0.9, 0], transition: { duration: 1.1, ease: 'easeOut' } },
  done: { r: 96, opacity: 0 },
};

const markVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.8 },
  shown: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 160, damping: 12 },
  },
};

interface GenesisRevealProps {
  story: BirthStory;
  /** The problem lines: the words (how long each holds) and the line shown, with its Read more */
  points: { text: string; node: ReactNode }[];
  /** The summary's highlight, the last line under the mark (with its Read more) */
  highlight: ReactNode;
  /** Everything is shown (the scene ran out, was skipped, or the card was seen before) */
  done: boolean;
  onDone: () => void;
}

export function GenesisReveal({ story, points, highlight, done, onDone }: GenesisRevealProps) {
  const reduced = useReducedMotion();
  const still = done || !!reduced;
  const pointCount = points.length;
  const { clear, line1, mark, end } = genesisSteps(pointCount, story.lines.length);
  const [step, setStep] = useState(still ? end : 1);
  const at = still ? end : step;
  // Opened already done: a revisit (Back, or the card seen before)
  const [openedDone] = useState(done);

  // The latest callback, problem words and story lines, so a parent's new function or array each
  // render doesn't restart the timers (the effect depends only on the step layout)
  const onDoneRef = useRef(onDone);
  const pointTextsRef = useRef(points.map((point) => point.text));
  const linesRef = useRef(story.lines);
  useEffect(() => {
    onDoneRef.current = onDone;
    pointTextsRef.current = points.map((point) => point.text);
    linesRef.current = story.lines;
  });

  useEffect(() => {
    if (done) return;
    if (reduced) {
      onDoneRef.current();
      return;
    }
    const timer = window.setTimeout(
      () => {
        if (step < end) setStep(step + 1);
        else onDoneRef.current();
      },
      holdFor(step, pointTextsRef.current, linesRef.current, { clear, line1, mark, end })
    );
    return () => window.clearTimeout(timer);
  }, [done, reduced, step, clear, line1, mark, end]);

  // Every part at once, in reading order, nothing moving (the stage flows): with reduced motion, on a
  // revisit, or when the learner skipped ahead (a tap, Enter, a Read more) before the end. Only a
  // scene that played to its end rests on the mark alone, as the owner chose (review 2026-11-12)
  const full = !!reduced || openedDone || (done && step < end);
  const initial = (state: string) => (still ? state : 'hidden');
  const pointsOn = full || at < clear;

  // A keyboard user on a problem's Read more when the problems clear keeps their place: focus moves
  // to the scene, not to the page's body (review 2026-11-12)
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!pointsOn && listRef.current?.contains(document.activeElement)) rootRef.current?.focus();
  }, [pointsOn]);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={styles.genesis}
      data-step={at}
      data-dark={at >= clear}
      data-full={full}
      onClick={() => {
        if (!done) onDone();
      }}
      {...guide('lesson.genesis')}
    >
      <div className={styles.stage}>
        <ol ref={listRef} className={styles.points} inert={!pointsOn} aria-hidden={!pointsOn}>
          {points.map((point, i) => (
            <motion.li
              key={point.text}
              variants={lineVariants}
              initial={full ? 'shown' : initial('gone')}
              animate={full ? 'shown' : at >= clear ? 'gone' : at >= 1 + i ? 'shown' : 'hidden'}
              data-shown={full || (at >= 1 + i && at < clear)}
              inert={!full && at < 1 + i}
            >
              {point.node}
            </motion.li>
          ))}
        </ol>

        {/* The story, read once and whole after the problems it answers (the lines on screen are
            hidden from screen readers) */}
        <p className={styles.srOnly}>{story.lines.map((line) => line.text).join(' ')}</p>

        {story.lines.map((line, i) => {
          const own = line1 + i;
          const shown = full || at === own;
          return (
            <motion.p
              key={line.text}
              className={styles.line}
              aria-hidden="true"
              variants={lineVariants}
              initial={full ? 'shown' : initial('gone')}
              animate={shown ? 'shown' : at > own ? 'gone' : 'hidden'}
              data-shown={shown}
            >
              {emphasize(line.text, line.emphasis)}
            </motion.p>
          );
        })}

        <div className={styles.finale} inert={at < end} aria-hidden={at < end}>
          <svg viewBox="0 0 200 120" className={styles.scene} aria-hidden="true" focusable="false">
            <motion.circle
              cx="100"
              cy="60"
              className={styles.ring}
              variants={ringVariants}
              initial={still ? 'done' : 'hidden'}
              animate={still ? 'done' : at >= mark ? 'burst' : 'hidden'}
            />
            <motion.image
              href={CRYPTO_ICON_URLS.BTC}
              x="64"
              y="24"
              width="72"
              height="72"
              className={styles.mark}
              variants={markVariants}
              initial={still ? 'shown' : 'hidden'}
              animate={at >= mark ? 'shown' : 'hidden'}
              data-shown={at >= mark}
            />
          </svg>
          <motion.div
            className={styles.end}
            variants={lineVariants}
            initial={still ? 'shown' : 'hidden'}
            animate={at >= end ? 'shown' : 'hidden'}
            data-shown={at >= end}
          >
            {highlight}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
