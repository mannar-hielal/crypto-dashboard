import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SESSION_RECONNECT_TRIES, SESSION_REUSE_WINDOW_MS } from '@crypto-dashboard/sdk';
import {
  purgeStaleRefreshTokens,
  REFRESH_REUSE_CAP,
  REFRESH_REUSE_WINDOW_MS,
  runRefreshTokenPurge,
} from '../services/RefreshTokens.js';

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

describe('the reuse cap and the client’s retries (review on #288)', () => {
  it('should serve every reconnect retry of a lost reply, with room for a second tab', () => {
    // The client retries SESSION_RECONNECT_TRIES times; each retry of a lost reply is one reuse
    expect(REFRESH_REUSE_CAP).toBeGreaterThan(SESSION_RECONNECT_TRIES);
  });
});

describe('runRefreshTokenPurge (the daily job’s step, review on #288)', () => {
  it('should log a failure with its own message and never throw', async () => {
    const error = vi.fn();
    const app = {
      prisma: { refreshToken: { findMany: vi.fn().mockRejectedValue(new Error('db down')) } },
      log: { info: vi.fn(), error },
    } as unknown as Pick<FastifyInstance, 'prisma' | 'log'>;
    await expect(runRefreshTokenPurge(app)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.any(Error), 'Error purging expired refresh tokens');
  });

  it('should log how many expired tokens it removed', async () => {
    const info = vi.fn();
    const app = {
      prisma: {
        refreshToken: {
          findMany: vi.fn().mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]),
          deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      },
      log: { info, error: vi.fn() },
    } as unknown as Pick<FastifyInstance, 'prisma' | 'log'>;
    await runRefreshTokenPurge(app);
    expect(info).toHaveBeenCalledWith({ count: 2 }, 'Purged expired refresh tokens');
  });
});

describe('the reuse window and the client’s retry deadline (review on #289)', () => {
  it('should be the same window on both sides, so the client stops retrying before it closes', () => {
    expect(REFRESH_REUSE_WINDOW_MS).toBe(SESSION_REUSE_WINDOW_MS);
  });
});
