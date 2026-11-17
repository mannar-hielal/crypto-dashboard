/**
 * The learning map, "Crypto trading path" (owner's visual Q&A 2026-10-24; renamed 2026-11-12, the
 * zig-zag kept): chapters of nodes walked in order — a lesson, then practice on the real screen, then the chapter's checkpoint.
 * A node opens once the one before it is done; a practice tour skipped on a phone counts as passed,
 * so a small screen never blocks the path. The checkpoint is always open: passing it early ("test
 * out") opens the rest of the chapter and the next one, without ticking what was skipped.
 *
 * Two kinds of lock never look alike: `locked` (not reached yet: a padlock) and `pro` (not on the
 * plan: a gem). Nothing is paid today. Pure data and logic: no React, no store.
 */

import { getLesson, lessonScreens, type LessonId } from '@/guide/lessons';
import { getTour, type PathTourId } from '@/guide/tours';
import { canOpen, FREE, type Entitlement } from './access';
import { getCheckpoint, type CheckpointId } from './checkpoints';

export type BuiltNode =
  | { kind: 'lesson'; id: LessonId; access: Entitlement }
  | { kind: 'tour'; id: PathTourId; access: Entitlement }
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
    // Owner 2026-11-16: our own title (the old one was too close to the benchmark's unit name)
    title: 'Start here: crypto and trading basics',
    tone: 'purpleDark',
    access: FREE,
    status: 'open',
    nodes: [
      { kind: 'lesson', id: 'lesson-01', access: FREE },
      { kind: 'lesson', id: 'lesson-ownership', access: FREE },
      { kind: 'lesson', id: 'lesson-02', access: FREE },
      // Deliberately kept here (open question for the owner, 2026-11-16): Lesson 1's Try now runs
      // these two tours, so a learner who did it finds them already done. Where the practical stops
      // sit is the owner's call (lesson-authoring skill: the path keeps its order until the owner
      // places them); a finished stop is no blocker, and a learner who skipped Lesson 1's Try
      // still meets them here
      { kind: 'tour', id: 'buy-first-coin', access: FREE },
      { kind: 'tour', id: 'sell-and-review', access: FREE },
      { kind: 'checkpoint', id: 'checkpoint-ch1', access: FREE },
    ],
  },
  {
    // Placeholder titles until the Lessons 1–3 makeover places the next unit (the lesson-authoring
    // skill: the path follows the topic order, with our own titles)
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

/**
 * A practical lesson that needs another one done first, whatever else opened the path (owner
 * 2026-11-17): Sell sells the Bitcoin Buy bought, so it stays locked until Buy is done, even with
 * Buy skipped or the chapter tested out. (Its first steps still say to buy first, for a learner who
 * reaches it some other way with nothing to sell.)
 */
export const NEEDS_DONE: Partial<Record<PathTourId, PathTourId>> = {
  'sell-and-review': 'buy-first-coin',
};

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
  /**
   * How much of a started lesson is done, 0–1 (owner 2026-11-12, Duolingo's ring): the furthest
   * screen reached over the lesson's screens. Null for a tour, a checkpoint, or a lesson not begun
   */
  fraction: number | null;
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
  tours: Partial<Record<PathTourId, true>>;
  /** Tours skipped for now (the server's `dismissed`) */
  skippedTours: Partial<Record<PathTourId, true>>;
  checkpoints: Partial<Record<CheckpointId, true>>;
  /** The furthest screen (0-based) reached in each lesson, synced through the server */
  reached?: Partial<Record<LessonId, number>>;
}

export interface PathView {
  chapters: ChapterView[];
  /** Finished nodes over all built nodes, 0–100 */
  percent: number;
  /** The next step's key, if any */
  current: string | null;
}

/** The map's zig-zag (owner 2026-11-12: back, it breaks the monotony): a stop's sideways offset */
export function nodeOffset(index: number): number {
  return Math.round(Math.sin(index * 0.9) * 40);
}

/** A started, unfinished lesson's share done; null when there's nothing to show */
export function lessonFraction(
  id: LessonId,
  reached: number | undefined,
  done: boolean
): number | null {
  if (done || reached === undefined) return null;
  const screens = lessonScreens(getLesson(id)).length;
  // On the last screen without a Finish the ring is full but the lesson isn't done: it stays, so
  // the bubble still says Continue
  return Math.min(reached + 1, screens) / screens;
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

/** A stop done on the real chart: practice, or a lesson whose "Try it" is a tour there (Lesson 3) */
export function onChart(node: BuiltNode): boolean {
  return node.kind === 'tour' || (node.kind === 'lesson' && getLesson(node.id).tour !== undefined);
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
    // Passes from before the Lessons 1–3 rewrite were cleared with its questions (owner 2026-11-17,
    // migration 20261117090000_reset_checkpoint_ch1): a pass here is of today's checkpoint
    const testedOut = checkpoint ? isDone(checkpoint, progress) : false;
    // Every node before this one is done or skipped
    let reached = !locked;
    let done = 0;

    const nodes = chapter.nodes.map((node): NodeView => {
      const key = nodeKey(node);
      const view = {
        node,
        key,
        title: nodeTitle(node),
        minutes: nodeMinutes(node),
        fraction:
          node.kind === 'lesson'
            ? lessonFraction(node.id, progress.reached?.[node.id], isDone(node, progress))
            : null,
      };
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
      // Its prerequisite not done: locked, without holding up the stops after it
      const needs = node.kind === 'tour' ? NEEDS_DONE[node.id] : undefined;
      if (needs && progress.tours[needs] !== true) return { ...view, state: 'locked' };
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
