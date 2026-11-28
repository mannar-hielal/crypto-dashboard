import { useTourStore } from '@/guide/tourStore';
import { isSwapTour } from '@/guide/tours';

/**
 * Ends the practice swap's guide, if it is running: for a control that works the order form, which
 * the swap panel stands in the place of
 */
export function leaveSwapGuide(): void {
  const tour = useTourStore.getState();
  if (isSwapTour(tour.activeId)) tour.close();
}
