/**
 * Keeps the account's tour progress and the store in step: read it once signed in, write each new
 * finish / dismissal as it happens. A failed write is dropped — progress then lives only in this
 * session, which is the worst case, never a broken tour.
 */

import { useEffect } from 'react';
import { learnApi } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { useTourStore } from './tourStore';
import { isTourId, type TourId } from './tours';

export function useTourProgress(): void {
  const accessToken = useAuthStore((s) => s.accessToken);

  // Read
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    learnApi
      .getProgress(accessToken)
      .then(({ items }) => {
        if (cancelled) return;
        const completed = items
          .filter((i) => i.status === 'completed' && isTourId(i.itemId))
          .map((i) => i.itemId as TourId);
        // The primer finished means the offer is done with, dismissed or not
        const cardDismissed =
          items.some((i) => i.itemId === 'welcome-card') || completed.includes('primer');
        useTourStore.getState().setProgress({ completed, cardDismissed });
      })
      .catch(() => {
        // Can't read it: show no offer rather than one that may already have been answered
        if (!cancelled) useTourStore.getState().setProgress({ completed: [], cardDismissed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // Write
  useEffect(() => {
    if (!accessToken) return;
    return useTourStore.subscribe((state, prev) => {
      // The read above flips `loaded`: that change is the server's answer, not the learner's
      if (!prev.loaded) return;
      for (const id of Object.keys(state.completed) as TourId[]) {
        if (!prev.completed[id]) {
          learnApi.setProgress(id, 'completed', accessToken).catch(() => undefined);
        }
      }
      if (state.cardDismissed && !prev.cardDismissed) {
        learnApi.setProgress('welcome-card', 'dismissed', accessToken).catch(() => undefined);
      }
    });
  }, [accessToken]);
}
