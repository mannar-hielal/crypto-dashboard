import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';
import { usePathStore } from './pathStore';
import { forgetAllDone } from './pendingDone';

/**
 * 🔐 An explicit sign-out (the menu, a password change, an account deletion, the unverified page's
 * sign-out): the device forgets what belonged to that account, so a shared device shows the next
 * person none of it. The lessons, tours and map in memory start again, and the finishes this device
 * kept to save are dropped (redone if it was them, the worst case). Called beside the paper store's
 * own clear at each flow, never on a session that merely expired: those kept finishes are exactly
 * what the queue is for, and the same person signs back in.
 */
export function forgetSignedOutAccount(): void {
  forgetAllDone();
  useLessonStore.getState().reset();
  useTourStore.getState().reset();
  usePathStore.getState().reset();
}
