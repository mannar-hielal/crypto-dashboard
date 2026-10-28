/**
 * The learning map (owner's visual Q&A 2026-10-24, after Finelo's "Crypto path"): chapters of
 * nodes walked in order — a lesson, then practice on the real screen, then the chapter's checkpoint.
 * A node opens once the one before it is done; a practice tour skipped on a phone counts as passed,
 * so a small screen never blocks the path. The checkpoint is always open: passing it early ("test
 * out") opens the rest of the chapter and the next one, without ticking what was skipped.
 *
 * Two kinds of lock never look alike: `locked` (not reached yet: a padlock) and `pro` (not on the
 * plan: a gem). Nothing is paid today. Pure data and logic: no React, no store.
 */

import { getLesson, type LessonId } from '@/guide/lessons';
import { getTour, type TourId } from '@/guide/tours';
import { canOpen, FREE, type Entitlement } from './access';
import { getCheckpoint, type CheckpointId } from './checkpoints';

export type BuiltNode =
  | { kind: 'lesson'; id: LessonId; access: Entitlement }
  | { kind: 'tour'; id: TourId; access: Entitlement }
  | { kind: 'checkpoint'; id: CheckpointId; access: Entitlement };

export type NodeKind = BuiltNode['kind'];

/** A node of a chapter that isn't written yet: a title only, never tappable */
export interface SoonNode {
  kind: NodeKind;
  title: string;
}

/** The chapter band's colour: a token in `lib/tokens.ts` (`color.*`) */
export type ChapterTone = 'purpleDark' | 'green';

interface ChapterBase {
  id: string;
  number: number;
  title: string;
  tone: ChapterTone;
  access: Entitlement;
}

export type Chapter =
  | (ChapterBase & { status: 'open'; nodes: BuiltNode[] })
  | (ChapterBase & { status: 'soon'; preview: SoonNode[] });

export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'ch1',
    number: 1,
    title: 'Foundations of crypto',
    tone: 'purpleDark',
    access: FREE,
    status: 'open',
    nodes: [
      { kind: 'lesson', id: 'lesson-01', access: FREE },
      { kind: 'lesson', id: 'lesson-02', access: FREE },
      { kind: 'tour', id: 'buy-first-coin', access: FREE },
      { kind: 'tour', id: 'sell-and-review', access: FREE },
      { kind: 'checkpoint', id: 'checkpoint-ch1', access: FREE },
    ],
  },
  {
    // Stage 0/1 of guided-learning-topics/00-learning-path-plan.md: titles until it's written
    id: 'ch2',
    number: 2,
    title: 'Trade with a plan',
    tone: 'green',
    access: FREE,
    status: 'soon',
    preview: [
      { kind: 'lesson', title: 'Limit orders: wait for your price' },
      { kind: 'lesson', title: 'Stop-loss and take-profit' },
      { kind: 'lesson', title: 'Risk 1–2% of the account' },
      { kind: 'lesson', title: 'Scams and red flags' },
      { kind: 'checkpoint', title: 'Checkpoint' },
    ],
  },
];

// ─── State ───────────────────────────────────────────────────────────────────

/**
 * - `done`: finished (a checkpoint: passed)
 * - `current`: the next step on the path (one at most)
 * - `open`: may be started, but isn't the next step (tested out, or a checkpoint taken early)
 * - `skipped`: a practice tour skipped for now; it no longer blocks the path
 * - `locked`: not reached yet
 * - `pro`: not on the learner's plan
 */
export type NodeState = 'done' | 'current' | 'open' | 'skipped' | 'locked' | 'pro';

export interface NodeView {
  node: BuiltNode;
  key: string;
  title: string;
  minutes: number;
  state: NodeState;
}

interface ChapterViewBase {
  /** Stops in the chapters before this one: the map's zig-zag carries on across chapters */
  firstIndex: number;
}

export type ChapterView =
  | (ChapterViewBase & {
      chapter: Chapter & { status: 'open' };
      locked: boolean;
      nodes: NodeView[];
      done: number;
    })
  | (ChapterViewBase & { chapter: Chapter & { status: 'soon' }; locked: true; nodes: []; done: 0 });

export interface PathProgress {
  lessons: Partial<Record<LessonId, true>>;
  tours: Partial<Record<TourId, true>>;
  /** Tours skipped for now (the server's `dismissed`) */
  skippedTours: Partial<Record<TourId, true>>;
  checkpoints: Partial<Record<CheckpointId, true>>;
}

export interface PathView {
  chapters: ChapterView[];
  /** Finished nodes over all built nodes, 0–100 */
  percent: number;
  /** The next step's key, if any */
  current: string | null;
}

/** The map's zig-zag: a stop's sideways offset in px, by its index on the whole map */
export function nodeOffset(index: number): number {
  return Math.round(Math.sin(index * 0.9) * 40);
}

export const nodeKey = (node: { kind: NodeKind; id: string }): string => `${node.kind}:${node.id}`;

export function nodeTitle(node: BuiltNode): string {
  switch (node.kind) {
    case 'lesson':
      return getLesson(node.id).title;
    case 'tour':
      return getTour(node.id).title;
    case 'checkpoint':
      return getCheckpoint(node.id).title;
  }
}

function nodeMinutes(node: BuiltNode): number {
  switch (node.kind) {
    case 'lesson':
      return getLesson(node.id).minutes;
    case 'tour':
      return getTour(node.id).minutes;
    case 'checkpoint':
      // About half a minute a question
      return Math.max(1, Math.round(getCheckpoint(node.id).questions.length / 2));
  }
}

function isDone(node: BuiltNode, p: PathProgress): boolean {
  switch (node.kind) {
    case 'lesson':
      return p.lessons[node.id] === true;
    case 'tour':
      return p.tours[node.id] === true;
    case 'checkpoint':
      return p.checkpoints[node.id] === true;
  }
}

const checkpointOf = (chapter: Chapter & { status: 'open' }) =>
  chapter.nodes.find((n): n is BuiltNode & { kind: 'checkpoint' } => n.kind === 'checkpoint');

export function pathState(
  progress: PathProgress,
  granted: readonly Entitlement[] = [],
  chapters: readonly Chapter[] = CHAPTERS
): PathView {
  let current: string | null = null;
  let built = 0;
  let finished = 0;
  let stops = 0;
  // The first chapter is open; each later one opens when the one before it has its checkpoint passed
  let chapterOpen = true;

  const views = chapters.map((chapter): ChapterView => {
    const firstIndex = stops;
    if (chapter.status === 'soon') {
      chapterOpen = false;
      stops += chapter.preview.length;
      return { chapter, firstIndex, locked: true, nodes: [], done: 0 };
    }
    stops += chapter.nodes.length;
    const locked = !chapterOpen;
    const checkpoint = checkpointOf(chapter);
    const testedOut = checkpoint ? isDone(checkpoint, progress) : false;
    // Every node before this one is done or skipped
    let reached = !locked;
    let done = 0;

    const nodes = chapter.nodes.map((node): NodeView => {
      const key = nodeKey(node);
      const view = { node, key, title: nodeTitle(node), minutes: nodeMinutes(node) };
      built += 1;
      if (!canOpen(node.access, granted) || !canOpen(chapter.access, granted)) {
        // Not on the plan: never blocks what comes after it (a free path never ends at a paywall)
        return { ...view, state: 'pro' };
      }
      if (isDone(node, progress)) {
        finished += 1;
        done += 1;
        return { ...view, state: 'done' };
      }
      if (locked) return { ...view, state: 'locked' };
      if (node.kind === 'tour' && progress.skippedTours[node.id]) {
        return { ...view, state: 'skipped' };
      }
      // Tested out: what's left here is open to revisit, and the next step is in the next chapter
      if (testedOut) return { ...view, state: 'open' };
      if (reached) {
        reached = false;
        if (current === null) {
          current = key;
          return { ...view, state: 'current' };
        }
        return { ...view, state: 'open' };
      }
      // Past the next step: the checkpoint stays open, so anyone may test out
      return { ...view, state: node.kind === 'checkpoint' ? 'open' : 'locked' };
    });

    chapterOpen = !locked && testedOut;
    return { chapter, firstIndex, locked, nodes, done };
  });

  return {
    chapters: views,
    percent: built === 0 ? 0 : Math.round((finished / built) * 100),
    current,
  };
}

/** Keys of the nodes the learner may start now: what the Route button's dot compares */
export function openKeys(view: PathView): string[] {
  return view.chapters.flatMap((c) =>
    c.nodes.filter((n) => n.state === 'current' || n.state === 'open').map((n) => n.key)
  );
}
