import { Writable } from 'node:stream';
import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DAILY_CAP,
  MAX_KEYS,
  errorAlertHook,
  flushDigest,
  recordError,
  resetErrorAlerts,
  safeMessage,
  startErrorDigest,
  DIGEST_WINDOW_MS,
  type DigestEntry,
} from '../lib/errorAlerts.js';

/** A Pino logger with the hook, writing nowhere */
const quietLogger = () =>
  pino({ hooks: { logMethod: errorAlertHook } }, new Writable({ write: (_c, _e, cb) => cb() }));

const flushed = async (now = new Date('2026-09-29T12:00:00Z')) => {
  let got: DigestEntry[] = [];
  const sent = await flushDigest(async (e) => {
    got = e;
  }, now);
  return { sent, got };
};

describe('owner error digest (M8)', () => {
  beforeEach(() => resetErrorAlerts());

  it('should count error and fatal lines by source and message, not warnings, and keep no objects', async () => {
    const log = quietLogger();
    const trading = log.child({ service: 'TradingService' });
    trading.error({ err: new Error('boom'), note: 'not for the email' }, 'Order write failed');
    trading.error({ err: new Error('boom') }, 'Order write failed');
    log.child({ route: 'auth' }).fatal('DB down');
    log.warn('just a warning');

    const { sent, got } = await flushed();
    expect(sent).toBe(true);
    expect(got).toEqual([
      { source: 'TradingService', message: 'Order write failed', count: 2 },
      { source: 'auth', message: 'DB down', count: 1 },
    ]);
    expect(JSON.stringify(got)).not.toContain('not for the email');
  });

  it("should not count EmailService's own errors, so a failing send can't alert about itself", async () => {
    quietLogger().child({ service: 'EmailService' }).error('Failed to send the error digest');
    expect((await flushed()).sent).toBe(false);
  });

  it('should send nothing when nothing was counted, and start a new window after a send', async () => {
    expect((await flushed()).sent).toBe(false);
    recordError({ service: 'X' }, ['once']);
    expect((await flushed()).sent).toBe(true);
    expect((await flushed()).sent).toBe(false);
  });

  it(`should keep at most ${MAX_KEYS} kinds per window and count the rest together`, async () => {
    // Distinct kinds without digits (digits are masked, which would fold them into one)
    for (let i = 0; i < MAX_KEYS + 5; i++)
      recordError({ service: 'X' }, [`error ${'k'.repeat(i + 1)}`]);
    const { got } = await flushed();
    expect(got).toHaveLength(MAX_KEYS + 1);
    expect(got.find((e) => e.message.startsWith('other errors'))?.count).toBe(5);
  });

  it(`should send at most ${DAILY_CAP} digests a day, keep counting when capped, and send it all the next day`, async () => {
    const day = new Date('2026-09-29T08:00:00Z');
    let sent = 0;
    for (let i = 0; i < DAILY_CAP + 3; i++) {
      recordError({ service: 'X' }, ['again']);
      if ((await flushed(day)).sent) sent++;
    }
    expect(sent).toBe(DAILY_CAP);
    // The 3 windows after the cap weren't dropped: they arrive with the next day's first digest
    recordError({ service: 'X' }, ['again']);
    const next = await flushed(new Date('2026-09-30T08:00:00Z'));
    expect(next.sent).toBe(true);
    expect(next.got).toEqual([{ source: 'X', message: 'again', count: 4 }]);
  });

  it("should keep a window's counts, and not use the cap, when the send fails", async () => {
    recordError({ service: 'X' }, ['x']);
    const failing = vi.fn().mockRejectedValue(new Error('resend down'));
    await expect(flushDigest(failing)).rejects.toThrow('resend down');
    recordError({ service: 'X' }, ['x']);
    const { sent, got } = await flushed();
    expect(sent).toBe(true);
    expect(got).toEqual([{ source: 'X', message: 'x', count: 2 }]);
  });

  it('should keep one "other errors" bucket when an overflowing window is put back after a failed send', async () => {
    for (let i = 0; i < MAX_KEYS + 2; i++)
      recordError({ service: 'X' }, [`error ${'k'.repeat(i + 1)}`]);
    await expect(flushDigest(vi.fn().mockRejectedValue(new Error('down')))).rejects.toThrow('down');
    recordError({ service: 'Y' }, ['a new kind']); // overflows again
    const { got } = await flushed();
    const other = got.filter((e) => e.message.startsWith('other errors'));
    expect(other).toEqual([{ source: 'app', message: other[0]!.message, count: 3 }]);
    expect(got).toHaveLength(MAX_KEYS + 1);
  });

  it("should never send an error's own message text, and mask numbers, ids and emails", () => {
    const prisma = Object.assign(new Error('Unique constraint failed on email a@b.co'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    });
    // Fastify's own 5xx line: log.error({ res, err }, err.message)
    expect(safeMessage([{ err: prisma }, prisma.message])).toBe(
      'PrismaClientKnownRequestError P2002'
    );
    expect(safeMessage([prisma])).toBe('PrismaClientKnownRequestError P2002');
    // A message that quotes the error's text is dropped too
    expect(safeMessage([{ err: prisma }, `Order write failed: ${prisma.message}`])).toBe(
      'PrismaClientKnownRequestError P2002'
    );
    // Our own lines keep their message, masked
    expect(safeMessage([{ err: prisma }, 'Order write failed'])).toBe('Order write failed');
    expect(safeMessage(['Failed for user 12345 (me@example.com)'])).toBe(
      'Failed for user # <email>'
    );
    expect(safeMessage(['account 3f2c9a1e-7b1d-4c2e-9f00-1a2b3c4d5e6f not found'])).toBe(
      'account <id> not found'
    );
  });

  it('should count one kind for a message that only differs by numbers', async () => {
    recordError({ service: 'X' }, ['Failed for user 1']);
    recordError({ service: 'X' }, ['Failed for user 2']);
    expect((await flushed()).got).toEqual([
      { source: 'X', message: 'Failed for user #', count: 2 },
    ]);
  });

  it('should report a failed send from the timer through onFailure, and keep the counts (review #201)', async () => {
    vi.useFakeTimers();
    try {
      recordError({ service: 'X' }, ['x']);
      const onFailure = vi.fn();
      const stop = startErrorDigest(vi.fn().mockRejectedValue(new Error('resend down')), onFailure);
      await vi.advanceTimersByTimeAsync(DIGEST_WINDOW_MS);
      stop();
      expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ message: 'resend down' }));
      expect((await flushed()).got).toEqual([{ source: 'X', message: 'x', count: 1 }]);
    } finally {
      vi.useRealTimers();
    }
  });
});
