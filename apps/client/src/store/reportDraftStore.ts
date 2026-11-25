/**
 * The bug report being written, kept while the panel is closed so a stray click outside it, or Esc,
 * does not lose what was typed. In memory only (never persisted: it can hold screenshots), and
 * emptied once the report is sent. At most `MAX_SCREENSHOTS` images, each about 1 MB.
 */

import { create } from 'zustand';
import type { BugReportScreenshot } from '@crypto-dashboard/sdk';

interface ReportDraftState {
  /** The account that wrote the draft: what is here is theirs and nobody else's */
  owner: string | null;
  description: string;
  screenshots: BugReportScreenshot[];
  setDescription: (description: string) => void;
  setScreenshots: (screenshots: BugReportScreenshot[]) => void;
  /**
   * 🔐 Called when the panel is opened: a draft written by another account (or by nobody we know) is
   * thrown away first, so the next person on a shared computer never sees the e-mail, the words or
   * the screenshots of the last. The same account keeps its draft, however often its token refreshes.
   */
  claim: (userId: string) => void;
  reset: () => void;
}

const EMPTY = {
  owner: null as string | null,
  description: '',
  screenshots: [] as BugReportScreenshot[],
};

export const useReportDraft = create<ReportDraftState>()((set) => ({
  ...EMPTY,
  setDescription: (description) => set({ description }),
  setScreenshots: (screenshots) => set({ screenshots }),
  claim: (userId) => set((s) => (s.owner === userId ? s : { ...EMPTY, owner: userId })),
  reset: () => set({ ...EMPTY }),
}));
