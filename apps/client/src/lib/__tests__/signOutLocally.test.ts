import { describe, expect, it } from 'vitest';
import { signOutLocally } from '@/lib/signOutLocally';
import { pendingDone, queueDone } from '@/learn/pendingDone';
import { useAuthStore } from '@/store/authStore';
import { useLessonStore } from '@/guide/lessonStore';

describe('signOutLocally', () => {
  it('should end the session and leave none of the account on the device', () => {
    localStorage.clear();
    useAuthStore.getState().setAuth('tok', { id: 'u1', email: 'a@b', username: 'a' } as never);
    queueDone('u1', { itemId: 'lesson-01', step: 81 });
    useLessonStore.getState().setCompleted(['lesson-01']);
    signOutLocally();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useLessonStore.getState().completed).toEqual({});
    expect(pendingDone('u1')).toEqual([]);
  });
});
