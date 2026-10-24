/**
 * The open article (owner's visual Q&A 2026-10-23: a right-hand drawer over the dimmed dashboard,
 * full screen on phones). Opened from a lesson's term peek or close, or from the Learn panel's
 * library. When it came from a lesson, `from` says where, and the lesson waits hidden behind the
 * drawer until it closes ("Back to Lesson 1"). In memory only.
 */

import { create } from 'zustand';
import type { LessonId } from '@/guide/lessons';
import type { ArticleId } from './articles';

export interface ArticleOrigin {
  lesson: LessonId;
  screen: number;
}

interface ArticleState {
  openId: ArticleId | null;
  /** The section to scroll to (an `h` block's id) */
  section: string | null;
  from: ArticleOrigin | null;
  open: (id: ArticleId, opts?: { section?: string; from?: ArticleOrigin }) => void;
  close: () => void;
  reset: () => void;
}

const initial = { openId: null, section: null, from: null } as const;

export const useArticleStore = create<ArticleState>()((set) => ({
  ...initial,
  open: (id, opts) => set({ openId: id, section: opts?.section ?? null, from: opts?.from ?? null }),
  close: () => set({ ...initial }),
  reset: () => set({ ...initial }),
}));
