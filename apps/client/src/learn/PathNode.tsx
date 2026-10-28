/**
 * One stop on the learning map: a round button that shows what it is (a lesson 📖, practice on the
 * real screen 🎯, a checkpoint 👑) and where the learner stands with it. The next step carries a
 * "Start" bubble and Tick beside it. A stop that can't be started explains why in a short note
 * under it, instead of doing nothing: not reached yet, needs a larger screen, or not on the plan.
 */

import { useState, type ReactNode } from 'react';
import { BookOpen, Check, Crown, Gem, Laptop, Lock, Target } from 'lucide-react';
import { GuideAvatar } from '@/guide/LessonArt';
import { guide } from '@/lib/guideAnchors';
import { nodeOffset, type NodeKind, type NodeView } from './path';
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
  const { node, state, title } = view;
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
        aria-label={`${KIND_LABEL[node.kind]}: ${title}, ${STATE_LABEL[state]}`}
        aria-disabled={state === 'locked' || state === 'pro' ? true : undefined}
        aria-expanded={explains ? noteOpen : undefined}
        onClick={() => (explains ? setNoteOpen((o) => !o) : onStart(view))}
      >
        {icon}
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
      </span>
      {noteOpen && note && (
        <p className={styles.note} role="status" {...guide('path.node.note', view.key)}>
          {note}
        </p>
      )}
    </li>
  );
}
