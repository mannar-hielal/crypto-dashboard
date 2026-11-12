/**
 * One stop on the learning map: a round button that shows what it is (a lesson 📖, practice on the
 * real screen 🏋, a checkpoint 👑; a lesson the learner tries out gets a small dumbbell badge, owner
 * 2026-11-12) and where the learner stands with it: a lesson begun shows a ring of how much is done,
 * as Duolingo's path does. The next step carries a
 * "Start" bubble and Tick beside it. A stop that can't be started explains why in a short note
 * under it, instead of doing nothing: not reached yet, needs a larger screen, or not on the plan.
 */

import { useState, type ReactNode } from 'react';
import { BookOpen, Check, Crown, Dumbbell, Gem, Laptop, Lock } from 'lucide-react';
import { GuideAvatar } from '@/guide/LessonArt';
import { guide } from '@/lib/guideAnchors';
import { getLesson, lessonScreens } from '@/guide/lessons';
import { MODE_LABEL, nodeOffset, type NodeKind, type NodeView } from './path';
import styles from './PathDrawer.module.css';

const KIND_ICON = { lesson: BookOpen, tour: Dumbbell, checkpoint: Crown } as const;

const KIND_LABEL: Record<NodeKind, string> = {
  lesson: 'Lesson',
  tour: 'Practice',
  checkpoint: 'Checkpoint',
};

const STATE_LABEL = {
  done: 'done',
  current: 'next step',
  open: 'open',
  skipped: 'skipped for now',
  locked: 'locked',
  pro: 'Pro',
} as const;

/** How much of a lesson is done, drawn around its stop from 12 o'clock (decorative: the label says it) */
function ProgressRing({ fraction }: { fraction: number }) {
  const r = 40;
  const length = 2 * Math.PI * r;
  return (
    <svg
      className={styles.ring}
      viewBox="0 0 88 88"
      aria-hidden="true"
      data-progress={fraction.toFixed(2)}
    >
      <circle cx="44" cy="44" r={r} className={styles.ringTrack} />
      <circle
        cx="44"
        cy="44"
        r={r}
        className={styles.ringArc}
        strokeDasharray={`${length * fraction} ${length}`}
        transform="rotate(-90 44 44)"
      />
    </svg>
  );
}

export function NodeIcon({ kind, size = 26 }: { kind: NodeKind; size?: number }) {
  const Icon = KIND_ICON[kind];
  return <Icon size={size} aria-hidden="true" />;
}

interface PathNodeProps {
  view: NodeView;
  index: number;
  /** A tour can run here (a laptop or tablet) */
  wide: boolean;
  /** Something on the path is already done: the bubble says Continue rather than Start */
  started: boolean;
  /** The stop before this one, for a locked stop's note */
  previousTitle: string | null;
  onStart: (view: NodeView) => void;
  onSkipTour: (view: NodeView) => void;
}

export function PathNode({
  view,
  index,
  wide,
  started,
  previousTitle,
  onStart,
  onSkipTour,
}: PathNodeProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const { node, state, title, mode, fraction } = view;
  const screens = node.kind === 'lesson' ? lessonScreens(getLesson(node.id)).length : 0;
  const progress =
    fraction !== null ? `, ${Math.round(fraction * screens)} of ${screens} screens` : '';
  // A lesson with a "Now you try it": the book keeps a small dumbbell
  const triesIt = node.kind === 'lesson' && mode === 'hands-on';
  const phoneTour = node.kind === 'tour' && !wide;
  // These open a note under the stop instead of starting it
  const explains = state === 'locked' || state === 'pro' || phoneTour;

  let note: ReactNode = null;
  if (state === 'locked') {
    note = previousTitle
      ? `Finish “${previousTitle}” first.`
      : 'Finish the chapter before it first.';
  } else if (state === 'pro') {
    note =
      'This is part of a future Pro plan. Everything you need to learn to trade stays free, and nothing is sold yet.';
  } else if (phoneTour) {
    note = (
      <>
        This practice runs on the real trading screen, so it needs a laptop or tablet.
        {state !== 'done' && state !== 'skipped' && (
          <button
            type="button"
            className={styles.noteAction}
            onClick={() => {
              setNoteOpen(false);
              onSkipTour(view);
            }}
            {...guide('path.tour.skip', node.id)}
          >
            Skip for now
          </button>
        )}
      </>
    );
  }

  const icon =
    state === 'done' ? (
      <Check size={28} strokeWidth={3} aria-hidden="true" />
    ) : state === 'pro' ? (
      <Gem size={24} aria-hidden="true" />
    ) : (
      <NodeIcon kind={node.kind} />
    );

  return (
    <li
      className={styles.stop}
      style={{ transform: `translateX(${nodeOffset(index)}px)` }}
      {...guide('path.node', view.key)}
      data-state={state}
      data-mode={mode}
    >
      {state === 'current' && (
        <div className={styles.bubbleRow} aria-hidden="true">
          <span className={styles.bubble}>{started ? 'Continue' : 'Start'}</span>
          <span className={styles.peek}>
            <GuideAvatar who="tick" />
          </span>
        </div>
      )}
      <button
        type="button"
        className={`${styles.node} ${styles[state]}`}
        aria-label={`${KIND_LABEL[node.kind]}${mode === 'hands-on' ? ', hands-on' : ''}: ${title}, ${STATE_LABEL[state]}${progress}`}
        aria-disabled={state === 'locked' || state === 'pro' ? true : undefined}
        aria-expanded={explains ? noteOpen : undefined}
        onClick={() => (explains ? setNoteOpen((o) => !o) : onStart(view))}
      >
        {fraction !== null && <ProgressRing fraction={fraction} />}
        {icon}
        {triesIt && state !== 'done' && (
          <span className={styles.tryBadge} aria-hidden="true">
            <Dumbbell size={11} />
          </span>
        )}
        {state === 'locked' && (
          <span className={styles.badge}>
            <Lock size={12} aria-hidden="true" />
          </span>
        )}
        {phoneTour && state !== 'locked' && state !== 'pro' && (
          <span className={styles.badge}>
            <Laptop size={12} aria-hidden="true" />
          </span>
        )}
      </button>
      <span className={styles.caption}>
        {title}
        {state === 'pro' && <span className={styles.proTag}>Pro</span>}
        {mode === 'hands-on' && <span className={styles.modeTag}>{MODE_LABEL[mode]}</span>}
      </span>
      {noteOpen && note && (
        <p className={styles.note} role="status" {...guide('path.node.note', view.key)}>
          {note}
        </p>
      )}
    </li>
  );
}
