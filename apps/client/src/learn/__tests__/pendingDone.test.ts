import { beforeEach, describe, expect, it } from 'vitest';
import { dropDone, pendingDone, queueDone } from '@/learn/pendingDone';

describe('pendingDone', () => {
  beforeEach(() => localStorage.clear());

  it('should keep a finish per account until it is dropped, one per item', () => {
    queueDone('a', { itemId: 'lesson-01', step: 81 });
    queueDone('a', { itemId: 'lesson-01', step: 82 });
    queueDone('a', { itemId: 'checkpoint-ch1', step: 2 });
    expect(pendingDone('a')).toEqual([
      { itemId: 'checkpoint-ch1', step: 2 },
      { itemId: 'lesson-01', step: 82 },
    ]);
    expect(pendingDone('b')).toEqual([]);
    dropDone('a', 'lesson-01');
    expect(pendingDone('a')).toEqual([{ itemId: 'checkpoint-ch1', step: 2 }]);
  });

  it('should read stored data as untrusted: only known ids and whole steps', () => {
    localStorage.setItem(
      'cd-pending-done:a',
      JSON.stringify({
        v: 1,
        items: [
          { itemId: 'lesson-02', step: 70 },
          { itemId: 'primer', step: 1 }, // a tour: never kept
          { itemId: 'lesson-01', step: 'x' },
          { itemId: 'lesson-01', step: 1000 },
          'junk',
        ],
      })
    );
    expect(pendingDone('a')).toEqual([{ itemId: 'lesson-02', step: 70 }]);
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
});
