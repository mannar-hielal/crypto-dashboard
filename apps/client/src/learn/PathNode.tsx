/**
 * One stop on the learning map's rail (owner's visual Q&A 2026-11-12, our own look rather than a
 * zig-zag): a marker on the rail and a card beside it, one button. The marker's shape says what the
 * stop asks: round for reading, a rounded square in green for hands-on (a "Now you try it", or
 * practice on the real screen), a diamond for a checkpoint. The card names it, its kind and minutes;
 * the next step carries a Start chip. A stop that can't be started explains why in a short note
 * under it, instead of doing nothing: not reached yet, needs a larger screen, or not on the plan.
 */

import { useState, type ReactNode } from 'react';
import { BookOpen, Check, Crown, Gem, Laptop, Lock, Pointer, Target } from 'lucide-react';
import { guide } from '@/lib/guideAnchors';
import { MODE_LABEL, type NodeKind, type NodeView, type StopMode } from './path';
import styles from './PathDrawer.module.css';

const KIND_ICON = { lesson: BookOpen, tour: Target, checkpoint: Crown } as const;

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

export function NodeIcon({
  kind,
  mode,
  size = 22,
}: {
  kind: NodeKind;
  mode?: StopMode;
  size?: number;
}) {
  // A hands-on lesson shows a pointing hand (you try it), not the book
  const Icon = kind === 'lesson' && mode === 'hands-on' ? Pointer : KIND_ICON[kind];
  return <Icon size={size} aria-hidden="true" />;
}

interface PathNodeProps {
  view: NodeView;
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
  wide,
  started,
  previousTitle,
  onStart,
  onSkipTour,
}: PathNodeProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const { node, state, title, mode, minutes } = view;
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
      <Check size={24} strokeWidth={3} aria-hidden="true" />
    ) : state === 'pro' ? (
      <Gem size={20} aria-hidden="true" />
    ) : (
      <NodeIcon kind={node.kind} mode={mode} />
    );

  return (
    <li
      className={styles.stop}
      {...guide('path.node', view.key)}
      data-state={state}
      data-mode={mode}
    >
      <button
        type="button"
        className={styles.stopButton}
        aria-label={`${KIND_LABEL[node.kind]}, ${MODE_LABEL[mode].toLowerCase()}: ${title}, ${STATE_LABEL[state]}`}
        aria-disabled={state === 'locked' || state === 'pro' ? true : undefined}
        aria-expanded={explains ? noteOpen : undefined}
        onClick={() => (explains ? setNoteOpen((o) => !o) : onStart(view))}
      >
        <span className={`${styles.node} ${styles[state]}`} aria-hidden="true">
          {icon}
          {state === 'locked' && (
            <span className={styles.badge}>
              <Lock size={11} />
            </span>
          )}
          {phoneTour && state !== 'locked' && state !== 'pro' && (
            <span className={styles.badge}>
              <Laptop size={11} />
            </span>
          )}
        </span>
        <span className={styles.card} aria-hidden="true">
          <span className={styles.caption}>
            {title}
            {state === 'pro' && <span className={styles.proTag}>Pro</span>}
          </span>
          <span className={styles.meta}>
            <span className={styles.mode}>{MODE_LABEL[mode]}</span> · {minutes} min
            {state === 'done' && ' · Done'}
          </span>
        </span>
        {state === 'current' && (
          <span className={styles.startChip} aria-hidden="true">
            {started ? 'Continue' : 'Start'}
          </span>
        )}
      </button>
      {noteOpen && note && (
        <p className={styles.note} role="status" {...guide('path.node.note', view.key)}>
          {note}
        </p>
      )}
    </li>
  );
}
