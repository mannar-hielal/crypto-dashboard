/**
 * The learning map's own state: practice tours skipped for now, checkpoints passed, and the
 * checkpoint being taken. In memory only — the account keeps the first two (useTourProgress syncs
 * them as `dismissed` / `completed`); a reload simply closes a checkpoint.
 */

import { create } from 'zustand';
import type { PathTourId } from '@/guide/tours';
import { checkpointScore, getCheckpoint, type CheckpointId } from './checkpoints';

interface PathStoreState {
  skippedTours: Partial<Record<PathTourId, true>>;
  checkpoints: Partial<Record<CheckpointId, true>>;
  /** The account's progress has been read (a write before it would echo the server's answer) */
  loaded: boolean;
  /** The checkpoint being taken, its question (`questions.length` = the result) and answers */
  checkpointId: CheckpointId | null;
  question: number;
  answers: number[];
  setProgress: (progress: { skippedTours: PathTourId[]; checkpoints: CheckpointId[] }) => void;
  /** A phone can't run a tour: skip it for now, so it doesn't block the path */
  skipTour: (id: PathTourId) => void;
  startCheckpoint: (id: CheckpointId) => void;
  answer: (option: number) => void;
  /** To the next question, or past the last one to the result (a pass is recorded there) */
  next: () => void;
  closeCheckpoint: () => void;
  reset: () => void;
}

type PathData = Pick<
  PathStoreState,
  'skippedTours' | 'checkpoints' | 'loaded' | 'checkpointId' | 'question' | 'answers'
>;

const initial = (): PathData => ({
  skippedTours: {},
  checkpoints: {},
  loaded: false,
  checkpointId: null,
  question: 0,
  answers: [],
});

export const usePathStore = create<PathStoreState>()((set, get) => ({
  ...initial(),

  setProgress: ({ skippedTours, checkpoints }) =>
    set({
      skippedTours: Object.fromEntries(skippedTours.map((id) => [id, true])),
      checkpoints: Object.fromEntries(checkpoints.map((id) => [id, true])),
      loaded: true,
    }),

  skipTour: (id) => set((s) => ({ skippedTours: { ...s.skippedTours, [id]: true } })),

  startCheckpoint: (id) => set({ checkpointId: id, question: 0, answers: [] }),

  answer: (option) => {
    const { checkpointId, question, answers } = get();
    // First answer stands: the "why" is shown against it
    if (!checkpointId || answers[question] !== undefined) return;
    const next = [...answers];
    next[question] = option;
    set({ answers: next });
  },

  next: () => {
    const { checkpointId, question, answers } = get();
    if (!checkpointId) return;
    const checkpoint = getCheckpoint(checkpointId);
    if (question >= checkpoint.questions.length || answers[question] === undefined) return;
    const result = question + 1 === checkpoint.questions.length;
    const passed = result && checkpointScore(checkpoint, answers) >= checkpoint.pass;
    set((s) => ({
      question: question + 1,
      ...(passed ? { checkpoints: { ...s.checkpoints, [checkpointId]: true } } : {}),
    }));
  },

  closeCheckpoint: () => set({ checkpointId: null, question: 0, answers: [] }),

  reset: () => set(initial()),
}));
