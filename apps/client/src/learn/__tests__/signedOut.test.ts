import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetOnSignOut } from '@/learn/signedOut';
import { pendingDone, queueDone } from '@/learn/pendingDone';
import { useAuthStore } from '@/store/authStore';
import { useLessonStore } from '@/guide/lessonStore';

describe('forgetOnSignOut', () => {
  let stop: () => void = () => undefined;
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearAuth();
    useLessonStore.getState().reset();
    stop = forgetOnSignOut();
  });
  afterEach(() => stop());

  it('should forget the device’s kept finishes and furthest screens at sign-out, whatever cleared it', () => {
    useAuthStore.getState().setAuth('tok', { id: 'u1', email: 'a@b', username: 'a' } as never);
    queueDone('u1', { itemId: 'lesson-02', step: 81 });
    useLessonStore.getState().setReached({ 'lesson-02': 4 });
    // The sign-out itself (the menu, settings, an expired session all clear the auth)
    useAuthStore.getState().clearAuth();
    expect(pendingDone('u1')).toEqual([]);
    expect(useLessonStore.getState().reached).toEqual({});
  });

  it('should keep them while signed in, through a session refresh', () => {
    useAuthStore.getState().setAuth('tok', { id: 'u1', email: 'a@b', username: 'a' } as never);
    queueDone('u1', { itemId: 'lesson-02', step: 81 });
    useAuthStore.getState().setAuth('tok2', { id: 'u1', email: 'a@b', username: 'a' } as never);
    expect(pendingDone('u1')).toHaveLength(1);
  });
});
