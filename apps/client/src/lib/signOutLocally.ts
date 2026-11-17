import { forgetSignedOutAccount } from '@/learn/signedOut';
import { useAuthStore } from '@/store/authStore';
import { usePaperStore } from '@/store/paperStore';

/**
 * 🔐 The device's side of an explicit sign-out (the menu, a password change, an account deletion,
 * the unverified page): the session goes, and nothing of the account stays on screen or on the
 * device for the next person (its trading state, its lessons, tours, map and kept finishes). The
 * one sequence every such flow calls, so a new one can't forget a part. Never for a session that
 * merely expired (session.ts clears the auth alone: the same person signs back in).
 */
export function signOutLocally(): void {
  useAuthStore.getState().clearAuth();
  usePaperStore.getState().clear();
  forgetSignedOutAccount();
}
