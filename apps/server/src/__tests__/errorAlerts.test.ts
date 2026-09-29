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
    for (let i = 0; i < MAX_KEYS + 5; i++) recordError({ service: 'X' }, [`error ${i}`]);
    const { got } = await flushed();
    expect(got).toHaveLength(MAX_KEYS + 1);
    expect(got.find((e) => e.message.startsWith('other errors'))?.count).toBe(5);
  });

  it(`should send at most ${DAILY_CAP} digests a day, and again the next day`, async () => {
    const day = new Date('2026-09-29T08:00:00Z');
    let sent = 0;
    for (let i = 0; i < DAILY_CAP + 3; i++) {
      recordError({ service: 'X' }, ['again']);
      if ((await flushed(day)).sent) sent++;
    }
    expect(sent).toBe(DAILY_CAP);
    recordError({ service: 'X' }, ['again']);
    expect((await flushed(new Date('2026-09-30T08:00:00Z'))).sent).toBe(true);
  });

  it('should pass a failed send on to the caller (the timer catches it)', async () => {
    recordError({ service: 'X' }, ['x']);
    const failing = vi.fn().mockRejectedValue(new Error('resend down'));
    await expect(flushDigest(failing)).rejects.toThrow('resend down');
  });
});
