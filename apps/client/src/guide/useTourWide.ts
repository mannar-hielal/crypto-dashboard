import { useMediaQuery } from '@/hooks/useMediaQuery';
import { TOUR_WIDE_QUERY } from './tours';

/**
 * The tours' desktop layout applies (a larger screen): which of a tour's steps run, and whether a
 * phone-only tour runs here. The one reading of the width for every screen that offers a tour, with
 * the tour store's own fallback (`isWideScreen`): no matchMedia counts as desktop.
 */
export function useTourWide(): boolean {
  return useMediaQuery(TOUR_WIDE_QUERY, true);
}
