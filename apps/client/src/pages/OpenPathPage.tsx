import { useEffect } from 'react';
import { Navigate } from 'react-router';

import { useTourStore } from '@/guide/tourStore';
import { DASHBOARD_PATH } from '@/lib/marketRoutes';

/**
 * The menu's "Crypto path" link (owner 2026-11-22): the dashboard with the learning map open.
 * It sits behind the sign-in guard, so a signed-out visitor is sent to log in and comes back here.
 * It only asks the tour store to open the map, then moves on to the dashboard (the map is a panel
 * of the dashboard, not a page of its own).
 */
export function OpenPathPage() {
  useEffect(() => {
    useTourStore.getState().openPanel();
  }, []);
  return <Navigate to={DASHBOARD_PATH} replace />;
}
