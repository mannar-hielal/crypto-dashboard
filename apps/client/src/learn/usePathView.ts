/**
 * The learning map as the learner stands on it, from the lesson, tour and path stores. No
 * entitlements are granted yet: everything on the map is free (`learn/access.ts`).
 */

import { useMemo } from 'react';
import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';
import { pathState, type PathView } from './path';
import { usePathStore } from './pathStore';

export function usePathView(): PathView {
  const lessons = useLessonStore((s) => s.completed);
  const reached = useLessonStore((s) => s.reached);
  const tours = useTourStore((s) => s.completed);
  const skippedTours = usePathStore((s) => s.skippedTours);
  const checkpoints = usePathStore((s) => s.checkpoints);
  return useMemo(
    () => pathState({ lessons, tours, skippedTours, checkpoints, reached }),
    [lessons, tours, skippedTours, checkpoints, reached]
  );
}
