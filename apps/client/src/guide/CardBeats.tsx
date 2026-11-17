/**
 * A cold open (owner's visual Q&A 2026-10-25): a card's lines appear one after another, like a film
 * trailer, and the card says when the last one is in so the Next button can show. A tap on the
 * lines (or Enter, handled by the sheet) shows them all at once; it never skips the card.
 *
 * Every line is always in the DOM: the hidden ones are only transparent, so a screen reader reads
 * the whole card at once. Reduced motion shows everything straight away.
 */

import { useEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { guide } from '@/lib/guideAnchors';
import { GuideAvatar } from './LessonArt';
import { compact, counterValue, formatDollars } from './beats';
import { GUIDE_NAMES, type Beat } from './lessons';
import { RichText } from '@/learn/RichText';
import { emphasize } from './emphasize';
import styles from './CardBeats.module.css';

/** The pause before each next line, and how long a counter takes */
export const BEAT_MS = 650;
const COUNTER_S = 1.6;

const beatVariants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
} as const;

type CounterBeat = Extract<Beat, { kind: 'counter' }>;

/** `run`: the reveal is playing; `active`: this line is in, so the climb starts */
function Counter({ beat, run, active }: { beat: CounterBeat; run: boolean; active: boolean }) {
  const [t, setT] = useState(run ? 0 : 1);

  useEffect(() => {
    if (!run || !active) return;
    const controls = animate(0, 1, { duration: COUNTER_S, ease: 'easeIn', onUpdate: setT });
    return () => controls.stop();
  }, [run, active]);

  const finished = !run || t >= 1;
  const shown = finished
    ? `${beat.prefix}${compact.format(beat.to)}`
    : formatDollars(counterValue(beat.from, beat.to, t));
  return (
    <>
      <span className={styles.srOnly}>{beat.text}</span>
      <span aria-hidden="true">
        {beat.label} <strong className={styles.big}>{shown}</strong>
      </span>
    </>
  );
}

function Headline({ beat }: { beat: Extract<Beat, { kind: 'headline' }> }) {
  return emphasize(beat.text, beat.emphasis, styles.big);
}

/**
 * A cold open's kicker, headline, counter and guides' lines are plain text by design (a headline
 * sets its part apart with `emphasis`); only a fact takes markup. LessonSheet's sweep fails any
 * lesson that shows a * or [[ on screen (weighed, review after release #308)
 */
function BeatLine({ beat, run, active }: { beat: Beat; run: boolean; active: boolean }) {
  switch (beat.kind) {
    case 'kicker':
      return <span className={styles.kicker}>{beat.text}</span>;
    case 'headline':
      return (
        <span className={styles.headline}>
          <Headline beat={beat} />
        </span>
      );
    case 'fact':
      return (
        <span className={styles.fact}>
          <RichText text={beat.text} />
        </span>
      );
    case 'counter':
      return (
        <span className={styles.fact}>
          <Counter beat={beat} run={run} active={active} />
        </span>
      );
    case 'line':
      return (
        <span className={styles.line}>
          <GuideAvatar who={beat.speaker} />
          <span>
            <strong className={styles.speaker}>{GUIDE_NAMES[beat.speaker]}</strong> {beat.text}
          </span>
        </span>
      );
  }
}

interface CardBeatsProps {
  beats: Beat[];
  /** Everything is shown (the reveal ran out, was skipped, or the card was seen before) */
  done: boolean;
  onDone: () => void;
}

export function CardBeats({ beats, done, onDone }: CardBeatsProps) {
  const reduced = useReducedMotion();
  /** How many lines are in so far */
  const [count, setCount] = useState(done || reduced ? beats.length : 1);
  const all = done || !!reduced || count >= beats.length;

  // The latest callback, so a parent's new function each render doesn't restart the timers
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // One more line every BEAT_MS (after a counter, once it has climbed); the last one ends the reveal
  const latest = beats[Math.min(count, beats.length) - 1];
  const pause = latest?.kind === 'counter' ? COUNTER_S * 1000 + 200 : BEAT_MS;
  useEffect(() => {
    if (done) return;
    if (reduced) {
      onDoneRef.current();
      return;
    }
    const timer = window.setTimeout(() => {
      if (count < beats.length) setCount(count + 1);
      else onDoneRef.current();
    }, pause);
    return () => window.clearTimeout(timer);
  }, [done, reduced, count, beats.length, pause]);

  const shown = all ? beats.length : count;
  return (
    <div
      className={styles.beats}
      onClick={() => {
        if (!done) onDone();
      }}
      {...guide('lesson.beats')}
    >
      {beats.map((beat, i) => (
        <motion.p
          key={beat.text}
          className={styles.beat}
          data-beat={beat.kind}
          data-shown={i < shown}
          variants={beatVariants}
          initial={reduced || done ? 'shown' : 'hidden'}
          animate={i < shown ? 'shown' : 'hidden'}
        >
          <BeatLine beat={beat} run={!done && !reduced} active={i < shown} />
        </motion.p>
      ))}
    </div>
  );
}
