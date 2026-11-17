import { beforeEach, describe, expect, it } from 'vitest';
import { forgetSignedOutAccount } from '@/learn/signedOut';
import { pendingDone, queueDone } from '@/learn/pendingDone';
import { useAuthStore } from '@/store/authStore';
import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';
import { usePathStore } from '@/learn/pathStore';

describe('forgetSignedOutAccount', () => {
  beforeEach(() => {
    localStorage.clear();
    useLessonStore.getState().reset();
    useTourStore.getState().reset();
    usePathStore.getState().reset();
  });

  /** An account's progress on this device: what a shared device must not show the next person */
  function accountOnDevice() {
    useAuthStore.getState().setAuth('tok', { id: 'u1', email: 'a@b', username: 'a' } as never);
    queueDone('u1', { itemId: 'lesson-02', step: 81 });
    useLessonStore.getState().setCompleted(['lesson-01']);
    useLessonStore.getState().setReached({ 'lesson-02': 4 });
    useTourStore.getState().setProgress({ completed: ['primer'], cardDismissed: true });
    usePathStore.getState().setProgress({ skippedTours: [], checkpoints: ['checkpoint-ch1'] });
  }

  it('should keep everything when a session only expires (the same person signs back in)', () => {
    accountOnDevice();
    useAuthStore.getState().clearAuth(); // an expired session: no sign-out flow ran
    expect(pendingDone('u1')).toHaveLength(1);
    expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
  });

  it('should forget the account’s progress and kept finishes at an explicit sign-out', () => {
    accountOnDevice();
    useAuthStore.getState().clearAuth();
    forgetSignedOutAccount();
    expect(pendingDone('u1')).toEqual([]);
    expect(useLessonStore.getState()).toMatchObject({ completed: {}, reached: {} });
    expect(useTourStore.getState()).toMatchObject({ completed: {}, loaded: false });
    expect(usePathStore.getState()).toMatchObject({ checkpoints: {}, loaded: false });
  });
});
