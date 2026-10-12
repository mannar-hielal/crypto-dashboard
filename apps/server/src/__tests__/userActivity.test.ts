import { describe, it, expect, vi } from 'vitest';
import {
  ACTIVITY_RETENTION_DAYS,
  purgeOldActivity,
  recordActivityDay,
  trackActivity,
  utcDay,
} from '../services/UserActivity.js';

function fakePrisma() {
  return {
    userActivity: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
  };
}

describe('utcDay', () => {
  it('is midnight UTC of the day, whatever the time', () => {
    expect(utcDay(new Date('2026-10-14T23:59:59.999Z')).toISOString()).toBe(
      '2026-10-14T00:00:00.000Z'
    );
    expect(utcDay(new Date('2026-10-14T00:00:00.000Z')).toISOString()).toBe(
      '2026-10-14T00:00:00.000Z'
    );
  });
});

describe('recordActivityDay', () => {
  it('inserts one row for the UTC day and skips a duplicate', async () => {
    const prisma = fakePrisma();
    await recordActivityDay(prisma as never, 'u1', new Date('2026-10-14T18:30:00Z'));
    expect(prisma.userActivity.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u1', day: new Date('2026-10-14T00:00:00.000Z') }],
      skipDuplicates: true,
    });
  });
});

describe('trackActivity', () => {
  it('logs a failure and never throws or rejects', async () => {
    const prisma = fakePrisma();
    prisma.userActivity.createMany.mockRejectedValueOnce(new Error('db down'));
    const warn = vi.fn();
    const app = { prisma, log: { warn } };

    expect(() => trackActivity(app as never, 'u1')).not.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    // 🔐 the error object is logged as `err`, nothing else of the user
    expect(warn.mock.calls[0][0]).toMatchObject({ service: 'UserActivity' });
    expect(JSON.stringify(warn.mock.calls[0][0])).not.toContain('u1');
  });
});

describe('purgeOldActivity', () => {
  it('deletes days older than the retention period and returns the count', async () => {
    const prisma = fakePrisma();
    const now = new Date('2026-10-14T12:00:00Z');
    const count = await purgeOldActivity(prisma as never, now);

    expect(count).toBe(3);
    const cutoff = new Date(Date.UTC(2026, 9, 14) - ACTIVITY_RETENTION_DAYS * 86_400_000);
    expect(prisma.userActivity.deleteMany).toHaveBeenCalledWith({ where: { day: { lt: cutoff } } });
    expect(ACTIVITY_RETENTION_DAYS).toBe(180);
  });
});
