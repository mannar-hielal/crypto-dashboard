import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dropDone, forgetAllDone, pendingDone, queueDone } from '@/learn/pendingDone';

describe('pendingDone', () => {
  beforeEach(() => {
    localStorage.clear();
    forgetAllDone(); // this session's in-memory lists too
  });

  it('should keep a finish per account until it is dropped, one per item', () => {
    queueDone('a', { itemId: 'lesson-01', step: 81 });
    queueDone('a', { itemId: 'lesson-01', step: 82 });
    queueDone('a', { itemId: 'checkpoint-ch1', step: 2 });
    expect(pendingDone('a').map(({ itemId, step }) => ({ itemId, step }))).toEqual([
      { itemId: 'checkpoint-ch1', step: 2 },
      { itemId: 'lesson-01', step: 82 },
    ]);
    expect(pendingDone('b')).toEqual([]);
    dropDone('a', 'lesson-01');
    expect(pendingDone('a').map((p) => p.itemId)).toEqual(['checkpoint-ch1']);
  });

  it('should read stored data as untrusted: only known ids and whole steps', () => {
    localStorage.setItem(
      'cd-pending-done:a',
      JSON.stringify({
        v: 1,
        items: [
          { itemId: 'lesson-02', step: 70, since: Date.now() },
          { itemId: 'primer', step: 1 }, // a tour: never kept
          { itemId: 'lesson-01', step: 'x' },
          { itemId: 'lesson-01', step: 1000 },
          'junk',
        ],
      })
    );
    expect(pendingDone('a')).toEqual([expect.objectContaining({ itemId: 'lesson-02', step: 70 })]);
    localStorage.setItem('cd-pending-done:a', '{not json');
    expect(pendingDone('a')).toEqual([]);
    // Another version, or a bare list, reads as nothing kept
    localStorage.setItem(
      'cd-pending-done:a',
      JSON.stringify({ v: 2, items: [{ itemId: 'lesson-02', step: 70 }] })
    );
    expect(pendingDone('a')).toEqual([]);
    localStorage.setItem('cd-pending-done:a', JSON.stringify([{ itemId: 'lesson-02', step: 70 }]));
    expect(pendingDone('a')).toEqual([]);
  });

  it('should give up one kept over 30 days', () => {
    const old = Date.now() - 31 * 86_400_000;
    localStorage.setItem(
      'cd-pending-done:a',
      JSON.stringify({ v: 1, items: [{ itemId: 'lesson-01', step: 81, since: old }] })
    );
    expect(pendingDone('a')).toEqual([]);
  });

  it('should forget every account’s kept finishes at sign-out, and nothing else', () => {
    queueDone('a', { itemId: 'lesson-01', step: 81 });
    queueDone('b', { itemId: 'checkpoint-ch1', step: 2 });
    localStorage.setItem('cd-layout', 'x');
    forgetAllDone();
    expect(pendingDone('a')).toEqual([]);
    expect(pendingDone('b')).toEqual([]);
    expect(localStorage.getItem('cd-layout')).toBe('x');
  });

  it('should drop a refused finish only while it still holds the refused step', () => {
    queueDone('a', { itemId: 'lesson-01', step: 81 });
    // A newer finish of the item was kept while the refused one was on its way
    queueDone('a', { itemId: 'lesson-01', step: 82 });
    dropDone('a', 'lesson-01', 81);
    expect(pendingDone('a')).toEqual([expect.objectContaining({ itemId: 'lesson-01', step: 82 })]);
    dropDone('a', 'lesson-01', 82);
    expect(pendingDone('a')).toEqual([]);
  });

  it('should never keep one dated far in the future, but keep one from a clock a little fast', () => {
    const kept = (since: number) => {
      localStorage.setItem(
        'cd-pending-done:a',
        JSON.stringify({ v: 1, items: [{ itemId: 'lesson-01', step: 81, since }] })
      );
      return pendingDone('a').length;
    };
    expect(kept(Date.now() + 2 * 86_400_000)).toBe(0); // a wrong clock or an edit: never expires
    expect(kept(Date.now() + 600_000)).toBe(1); // ten minutes fast, corrected since: still kept
  });

  it('should keep a finish made in this session when the storage write fails', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    queueDone('a', { itemId: 'lesson-01', step: 81 });
    expect(pendingDone('a')).toEqual([expect.objectContaining({ itemId: 'lesson-01', step: 81 })]);
    setItem.mockRestore();
  });

  it('should not bring back a finish given up on when storage refused the write that dropped it', async () => {
    queueDone('a', { itemId: 'lesson-01', step: 81 });
    queueDone('a', { itemId: 'checkpoint-ch1', step: 2 }); // both stored
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    dropDone('a', 'lesson-01'); // given up on: the write that drops it is refused
    setItem.mockRestore();
    // A reload: a fresh module (no list held in memory), the same storage
    vi.resetModules();
    const fresh = await import('@/learn/pendingDone');
    expect(fresh.pendingDone('a').some((p) => p.itemId === 'lesson-01')).toBe(false);
  });

  it('should keep earlier finishes stored when one more try after freeing the old list works', async () => {
    queueDone('a', { itemId: 'lesson-01', step: 81 }); // stored
    let refusals = 1;
    const real = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      k: string,
      v: string
    ) {
      if (refusals-- > 0) throw new Error('QuotaExceededError'); // full, once
      real.call(this, k, v);
    });
    queueDone('a', { itemId: 'checkpoint-ch1', step: 2 });
    setItem.mockRestore();
    vi.resetModules(); // a reload
    const fresh = await import('@/learn/pendingDone');
    expect(
      fresh
        .pendingDone('a')
        .map((p) => p.itemId)
        .sort()
    ).toEqual(['checkpoint-ch1', 'lesson-01']);
  });
});
