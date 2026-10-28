/**
 * Tick and Tock, the lessons' guides (owner 2026-10-22; moods and poses 2026-10-24): candles with
 * faces and arms. Tick is green with a top wick, Tock red with a bottom wick: a shape cue as well
 * as a colour, so neither depends on colour alone (design.md). A guide presents a card the way a
 * teacher points at a board, and reacts to answers: a grin for the right one, calm for "Not quite".
 */

import type { JSX } from 'react';
import type { Mood, Pose, Speaker } from '../lessons';
import styles from '../LessonArt.module.css';

/** The guide's box, in its own units: a 64 × 92 figure */
const GUIDE_WIDTH = 64;
const GUIDE_HEIGHT = 92;

const BODY_X = 16;
const BODY_W = 32;
const CX = BODY_X + BODY_W / 2;

/** Eyes and mouth for each mood, drawn around (CX, top) — `top` is the face's eye line */
function Face({ mood, top }: { mood: Mood; top: number }): JSX.Element {
  const L = CX - 6;
  const R = CX + 6;
  const eye = (x: number, look: [number, number] = [0, 0], r = 4.5) => (
    <g key={`e${x}`}>
      <circle cx={x} cy={top} r={r} className={styles.eye} />
      <circle cx={x + look[0]} cy={top + look[1]} r={r * 0.45} className={styles.pupil} />
    </g>
  );
  const shut = (x: number) => (
    <path
      key={`s${x}`}
      d={`M${x - 4} ${top} Q${x} ${top - 4} ${x + 4} ${top}`}
      className={styles.mouth}
    />
  );
  const mouthY = top + 13;
  switch (mood) {
    case 'smile':
      return (
        <>
          {eye(L)}
          {eye(R)}
          <path
            d={`M${CX - 6} ${mouthY} Q${CX} ${mouthY + 6} ${CX + 6} ${mouthY}`}
            className={styles.mouth}
          />
        </>
      );
    case 'grin':
      return (
        <>
          {shut(L)}
          {shut(R)}
          <path
            d={`M${CX - 8} ${mouthY - 2} Q${CX} ${mouthY + 10} ${CX + 8} ${mouthY - 2} Z`}
            className={styles.mouthOpen}
          />
        </>
      );
    case 'wink':
      return (
        <>
          {eye(L)}
          {shut(R)}
          <path
            d={`M${CX - 6} ${mouthY} Q${CX + 1} ${mouthY + 6} ${CX + 7} ${mouthY - 1}`}
            className={styles.mouth}
          />
        </>
      );
    case 'surprised':
      return (
        <>
          {eye(L, [0, 0], 5.5)}
          {eye(R, [0, 0], 5.5)}
          <ellipse cx={CX} cy={mouthY + 2} rx="3.5" ry="4.5" className={styles.mouthOpen} />
        </>
      );
    case 'curious':
      return (
        <>
          {eye(L, [1.2, -1.2])}
          {eye(R, [1.2, -1.2])}
          <path
            d={`M${R - 4} ${top - 9} Q${R} ${top - 12} ${R + 4} ${top - 9}`}
            className={styles.brow}
          />
          <path d={`M${CX - 4} ${mouthY + 1} L${CX + 5} ${mouthY - 1}`} className={styles.mouth} />
        </>
      );
    case 'thinking':
      return (
        <>
          {eye(L, [-1.4, -1.4])}
          {eye(R, [-1.4, -1.4])}
          <path d={`M${CX - 2} ${mouthY} L${CX + 6} ${mouthY}`} className={styles.mouth} />
        </>
      );
    case 'worried':
      return (
        <>
          {eye(L)}
          {eye(R)}
          <path d={`M${L - 4} ${top - 7} L${L + 3} ${top - 10}`} className={styles.brow} />
          <path d={`M${R + 4} ${top - 7} L${R - 3} ${top - 10}`} className={styles.brow} />
          <path
            d={`M${CX - 6} ${mouthY + 3} Q${CX - 3} ${mouthY} ${CX} ${mouthY + 2} Q${CX + 3} ${mouthY + 4} ${CX + 6} ${mouthY + 1}`}
            className={styles.mouth}
          />
        </>
      );
    case 'frank':
      return (
        <>
          {eye(L)}
          {eye(R)}
          <path d={`M${CX - 5} ${mouthY} L${CX + 5} ${mouthY}`} className={styles.mouth} />
        </>
      );
    case 'calm':
      return (
        <>
          {shut(L)}
          {shut(R)}
          <path
            d={`M${CX - 5} ${mouthY} Q${CX} ${mouthY + 4} ${CX + 5} ${mouthY}`}
            className={styles.mouth}
          />
        </>
      );
  }
}

/** Arms from the body's sides; `point` and `wave` raise the right one toward the scene */
function Arms({ pose, shoulder }: { pose: Pose; shoulder: number }) {
  const left = (
    <path d={`M${BODY_X} ${shoulder} L${BODY_X - 8} ${shoulder + 16}`} className={styles.arm} />
  );
  const rx = BODY_X + BODY_W;
  if (pose === 'point') {
    return (
      <>
        {left}
        <path d={`M${rx} ${shoulder} L${rx + 12} ${shoulder - 14}`} className={styles.arm} />
        <circle cx={rx + 13} cy={shoulder - 16} r="3.2" className={styles.body} />
      </>
    );
  }
  if (pose === 'wave') {
    return (
      <>
        {left}
        <path d={`M${rx} ${shoulder} L${rx + 6} ${shoulder - 18}`} className={styles.arm} />
        <circle cx={rx + 6} cy={shoulder - 21} r="3.6" className={styles.body} />
      </>
    );
  }
  return (
    <>
      {left}
      <path d={`M${rx} ${shoulder} L${rx + 8} ${shoulder + 16}`} className={styles.arm} />
    </>
  );
}

interface GuideProps {
  who: Speaker;
  mood: Mood;
  pose?: Pose;
  /** Top-left corner and scale of the 64 × 92 figure, in the parent SVG's units */
  x?: number;
  y?: number;
  scale?: number;
}

export function Guide({ who, mood, pose = 'stand', x = 0, y = 0, scale = 1 }: GuideProps) {
  const tick = who === 'tick';
  const bodyTop = tick ? 22 : 14;
  const bodyH = 52;
  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      className={tick ? styles.up : styles.down}
      data-guide-who={who}
      data-mood={mood}
      data-pose={pose}
    >
      {tick ? (
        <line x1={CX} y1="4" x2={CX} y2={bodyTop + 2} className={styles.wick} />
      ) : (
        <line x1={CX} y1={bodyTop + bodyH - 2} x2={CX} y2="88" className={styles.wick} />
      )}
      <Arms pose={pose} shoulder={bodyTop + 26} />
      <rect x={BODY_X} y={bodyTop} width={BODY_W} height={bodyH} rx="9" className={styles.body} />
      <Face mood={mood} top={bodyTop + 16} />
    </g>
  );
}

/** A guide on its own: beside a line of dialogue, a question, or a chart */
export function GuideFigure({
  who,
  mood,
  pose,
  className,
}: {
  who: Speaker;
  mood: Mood;
  pose?: Pose;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${GUIDE_WIDTH} ${GUIDE_HEIGHT}`}
      className={className ?? styles.avatar}
      aria-hidden="true"
      focusable="false"
    >
      <Guide who={who} mood={mood} pose={pose} />
    </svg>
  );
}
