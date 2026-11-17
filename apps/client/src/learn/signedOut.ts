import { useAuthStore } from '@/store/authStore';
import { useLessonStore } from '@/guide/lessonStore';
import { forgetAllDone } from './pendingDone';

/**
 * 🔐 At sign-out (the token goes, whichever flow cleared it: the menu, settings, an expired
 * session), the device forgets what belongs to that account: its unsaved finishes (a shared device
 * keeps no other account's id or progress) and the lessons' furthest screens. A store subscription,
 * not a component's effect: the dashboard is gone before an effect there would see the token go.
 * Called once at start-up (main.tsx); returns the unsubscribe.
 */
export function forgetOnSignOut(): () => void {
  return useAuthStore.subscribe((state, prev) => {
    if (prev.accessToken && !state.accessToken) {
      forgetAllDone();
      useLessonStore.getState().clearReached();
    }
  });
}
