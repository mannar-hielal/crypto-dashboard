import { describe, expect, it, vi } from 'vitest';
import { onePerKey } from '@/lib/onePerKey';

describe('onePerKey', () => {
  it('should share a request on its way, and send again once it has settled', async () => {
    const map = new Map<string, Promise<number>>();
    const send = vi.fn().mockResolvedValue(1);
    const a = onePerKey(map, 'k', send);
    const b = onePerKey(map, 'k', send);
    expect(a).toBe(b);
    await a;
    expect(map.size).toBe(0);
    await onePerKey(map, 'k', send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('should free the key after a failure too', async () => {
    const map = new Map<string, Promise<number>>();
    await expect(onePerKey(map, 'k', () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(map.size).toBe(0);
  });
});
