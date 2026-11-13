import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { purgeStaleRefreshTokens } from '../services/RefreshTokens.js';

describe('purgeStaleRefreshTokens', () => {
  it('should delete expired rows in batches, so a large first run never locks the table for long', async () => {
    const ids = (n: number, from = 0) =>
      Array.from({ length: n }, (_, i) => ({ id: `rt-${from + i}` }));
    const findMany = vi
      .fn()
      .mockResolvedValueOnce(ids(1000))
      .mockResolvedValueOnce(ids(1000, 1000))
      .mockResolvedValueOnce(ids(3, 2000));
    const deleteMany = vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve({ count: where.id.in.length })
    );
    const prisma = {
      refreshToken: { findMany, deleteMany },
    } as unknown as FastifyInstance['prisma'];

    const now = new Date('2026-11-13T00:00:00Z');
    expect(await purgeStaleRefreshTokens(prisma, now)).toBe(2003);
    expect(deleteMany).toHaveBeenCalledTimes(3);
    // By expiry only (indexed), never everything at once
    expect(findMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
      select: { id: true },
      take: 1000,
    });
  });

  it('should stop at once when nothing has expired', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([]);
    const deleteMany = vi.fn();
    const prisma = {
      refreshToken: { findMany, deleteMany },
    } as unknown as FastifyInstance['prisma'];
    expect(await purgeStaleRefreshTokens(prisma)).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
