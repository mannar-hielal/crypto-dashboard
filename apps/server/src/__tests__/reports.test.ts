import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const send = vi.fn();
const findUser = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
const recorded: Record<string, unknown>[] = [];
vi.mock('../services/emailOutbox.js', () => ({
  recordOutboxEmail: (e: Record<string, unknown>) => recorded.push(e),
}));
vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    app.decorate('prisma', { user: { findUnique: findUser } } as never);
  };
  Object.defineProperty(plugin, skipOverride, { value: true });
  return { prismaPlugin: plugin };
});

import { buildApp } from '../app.js';
import { config } from '../config.js';
import { REPORT_RATE_LIMIT, resetReportLimits } from '../routes/reports/index.js';

const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// A PNG that starts and ends like one (its middle is not a real image: the route checks the frame)
const IHDR = Buffer.concat([Buffer.from([0, 0, 0, 0x0d]), Buffer.from('IHDR'), Buffer.alloc(13)]);
const pngBytes = (middle = 'tiny') => Buffer.concat([PNG_SIG, IHDR, Buffer.from(middle), IEND]);
const PNG = pngBytes().toString('base64');
const b64 = (b: Buffer) => b.toString('base64');

const body = (over: Record<string, unknown> = {}) => ({
  description: 'The chart freezes when I switch interval',
  context: { area: 'chart', path: '/dashboard', viewport: '390x844@3', userAgent: 'UA' },
  screenshots: [],
  ...over,
});

describe('POST /api/reports', () => {
  let app: FastifyInstance;
  let auth: { authorization: string };

  const post = (payload: unknown, headers: Record<string, string> = auth) =>
    app.inject({ method: 'POST', url: '/api/reports', headers, payload: payload as object });

  beforeAll(async () => {
    app = await buildApp();
    auth = {
      authorization: `Bearer ${app.jwt.sign({ userId: 'u-1', email: 'user@example.com' })}`,
    };
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    send.mockReset().mockResolvedValue({ data: { id: 'x' }, error: null });
    findUser.mockReset().mockResolvedValue({
      email: 'user@example.com',
      emailVerifiedAt: new Date(),
      deletionRequestedAt: null,
    });
    resetReportLimits();
    recorded.length = 0;
    (config as { resendApiKey: string }).resendApiKey = 're_test';
  });

  it('should answer 401 without a token', async () => {
    expect((await post(body(), {})).statusCode).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['an email in the body (the form no longer carries one)', body({ email: 'user@example.com' })],
    ['a too-short description', body({ description: 'short' })],
    [
      '4 screenshots',
      body({ screenshots: Array(4).fill({ name: 'a', type: 'image/png', data: PNG }) }),
    ],
    ['an unknown top-level property', body({ extra: 1 })],
    ['an unknown context property', body({ context: { ...body().context, extra: 1 } })],
    [
      'mismatched magic bytes',
      body({ screenshots: [{ name: 'a', type: 'image/jpeg', data: PNG }] }),
    ],
    [
      'non-base64 data',
      body({ screenshots: [{ name: 'a', type: 'image/png', data: 'not base64!!' }] }),
    ],
    ['empty data', body({ screenshots: [{ name: 'a', type: 'image/png', data: '' }] })],
  ])('should answer 400 for %s', async (_n, payload) => {
    const res = await post(payload);
    expect(res.statusCode).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('should send one email for a report with no screenshots', async () => {
    const res = await post(body());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      to: config.adminEmail,
      replyTo: 'user@example.com',
      subject: '[Bug report] from user@example.com',
      attachments: [],
    });
    expect(recorded).toHaveLength(1);
  });

  it('should escape the description, attach a real PNG and sanitise its name', async () => {
    const res = await post(
      body({
        description: '<script>alert(1)</script>\nsecond line',
        screenshots: [{ name: '../../etc/pass\r\nwd.exe', type: 'image/png', data: PNG }],
      })
    );
    expect(res.statusCode).toBe(200);
    const mail = send.mock.calls[0][0];
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;<br>second line');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('u-1');
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].filename).toBe('screenshot-1.png');
    expect(Buffer.isBuffer(mail.attachments[0].content)).toBe(true);
    expect(recorded[0]).toMatchObject({
      kind: 'bug-report',
      replyTo: 'user@example.com',
      attachments: [{ name: 'screenshot-1.png', size: pngBytes().length }],
    });
  });

  it('should answer 500 with only the generic error when the provider fails', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'application_error' } });
    const errorSpy = vi.spyOn(app.log, 'error');
    const res = await post(body({ description: 'SECRET-DESCRIPTION text' }));
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal Server Error' });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('SECRET-DESCRIPTION');
  });

  it('should answer 500 when sending throws', async () => {
    send.mockRejectedValue(new Error('boom'));
    const res = await post(body());
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal Server Error' });
  });

  describe('who may report', () => {
    it('should refuse an account that has not verified its address', async () => {
      findUser.mockResolvedValue({
        email: 'user@example.com',
        emailVerifiedAt: null,
        deletionRequestedAt: null,
      });
      const res = await post(body());
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toMatch(/Verify your email/);
      expect(send).not.toHaveBeenCalled();
    });

    it('should refuse an account that has asked to be deleted', async () => {
      findUser.mockResolvedValue({
        email: 'user@example.com',
        emailVerifiedAt: new Date(),
        deletionRequestedAt: new Date(),
      });
      expect((await post(body())).statusCode).toBe(403);
      expect(send).not.toHaveBeenCalled();
    });

    it('should say a deleted-pending account cannot report, not that it needs to verify', async () => {
      findUser.mockResolvedValue({
        email: 'user@example.com',
        emailVerifiedAt: new Date(),
        deletionRequestedAt: new Date(),
      });
      const res = await post(body());
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toMatch(/being deleted/);
      expect(res.json().error).not.toMatch(/Verify/);
    });

    it('should refuse a token whose account no longer exists', async () => {
      findUser.mockResolvedValue(null);
      expect((await post(body())).statusCode).toBe(401);
      expect(send).not.toHaveBeenCalled();
    });

    it("should read the account by the token's user id, never trust an e-mail claim", async () => {
      await post(body());
      expect(findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u-1' } }));
    });
  });

  describe('the subject and the address', () => {
    it('should be "[Bug report] from" the account\'s own address, and nothing the reporter wrote', async () => {
      await post(body({ description: 'IGNORE THIS Subject: spoof\r\nBcc: x@y.z' }));
      const mail = send.mock.calls[0][0];
      expect(mail.subject).toBe('[Bug report] from user@example.com');
      expect(mail.subject).not.toMatch(/IGNORE|Bcc|[\r\n]/);
    });

    it('should use the address the database has for the account, never one from the request', async () => {
      findUser.mockResolvedValue({
        email: 'real@account.com',
        emailVerifiedAt: new Date(),
        deletionRequestedAt: null,
      });
      await post(body());
      const mail = send.mock.calls[0][0];
      expect(mail.subject).toBe('[Bug report] from real@account.com');
      expect(mail.replyTo).toBe('real@account.com');
      expect(mail.html).toContain('real@account.com');
      expect(mail.html).toContain('verified account');
    });

    it('should not take an address from the body at all: it is refused as an unknown field', async () => {
      const res = await post(body({ email: 'someone.else@example.org' }));
      expect(res.statusCode).toBe(400);
      expect(send).not.toHaveBeenCalled();
    });

    it('should set the Reply-To for an ordinary address, plus tags and all', async () => {
      findUser.mockResolvedValue({
        email: 'first.last+bugs@sub.example.co.uk',
        emailVerifiedAt: new Date(),
        deletionRequestedAt: null,
      });
      await post(body());
      expect(send.mock.calls[0][0].replyTo).toBe('first.last+bugs@sub.example.co.uk');
    });

    it.each(['a@b.com, c@d.com', '"a b"@example.com', 'a b@example.com', 'a@b.com;c@d.com'])(
      'should send without a Reply-To, and say so, when the account address (%s) is not one plain mailbox',
      async (stored) => {
        findUser.mockResolvedValue({
          email: stored,
          emailVerifiedAt: new Date(),
          deletionRequestedAt: null,
        });
        const res = await post(body());
        expect(res.statusCode).toBe(200);
        const mail = send.mock.calls[0][0];
        expect(mail.replyTo).toBeUndefined();
        expect(mail.html).toContain('no Reply-To');
        expect(mail.subject).not.toMatch(/[\r\n]/);
      }
    );

    it('should keep a header injection in a stored address out of the subject', async () => {
      findUser.mockResolvedValue({
        email: 'a@b.com\r\nBcc: evil@example.org',
        emailVerifiedAt: new Date(),
        deletionRequestedAt: null,
      });
      await post(body());
      const mail = send.mock.calls[0][0];
      expect(mail.subject).not.toMatch(/[\r\n]/);
      expect(mail.replyTo).toBeUndefined();
    });
  });

  describe('hidden characters', () => {
    it('should remove control, zero-width and direction-override characters from the description and context', async () => {
      await post(
        body({
          description: 'fake\u202Eexe.txt and\u0000 hid\u200Bden\u0007 words here',
          context: { ...body().context, userAgent: 'UA\u202E\r\nX-Injected: 1' },
        })
      );
      const html = send.mock.calls[0][0].html as string;
      // eslint-disable-next-line no-control-regex -- the test looks for exactly these characters
      expect(html).not.toMatch(/[\u202E\u0000\u200B\u0007]/);
      expect(html).toContain('fakeexe.txt and hidden words here');
      expect(html).not.toContain('\r\nX-Injected');
    });

    it('should refuse a description that is only hidden characters', async () => {
      const res = await post(
        body({ description: '\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B' })
      );
      expect(res.statusCode).toBe(400);
      expect(send).not.toHaveBeenCalled();
    });

    it('should keep an emoji that uses a joiner', async () => {
      await post(body({ description: 'Broken on the \u{1F468}\u200D\u{1F4BB} page, please look' }));
      expect(send.mock.calls[0][0].html).toContain('\u{1F468}\u200D\u{1F4BB}');
    });
  });

  describe('a screenshot must be only a picture', () => {
    const shot = (type: string, buf: Buffer) => ({ name: 'a', type, data: b64(buf) });
    // SOI, an APP0 segment, an SOF0 frame header, then the picture data and the tail
    const jpeg = (tail = [0xff, 0xd9]) =>
      Buffer.from([
        0xff,
        0xd8,
        0xff,
        0xe0,
        0,
        4,
        0,
        0,
        0xff,
        0xc0,
        0,
        11,
        8,
        0,
        1,
        0,
        1,
        1,
        1,
        0x11,
        0,
        0xff,
        0xda,
        9,
        9,
        ...tail,
      ]);
    const webp = (extra = 0) => {
      const body = Buffer.from('WEBPVP8 tiny');
      const head = Buffer.alloc(8);
      head.write('RIFF', 0, 'latin1');
      head.writeUInt32LE(body.length + extra, 4);
      return Buffer.concat([head, body]);
    };

    it.each([
      ['a PNG', shot('image/png', pngBytes())],
      ['a JPEG', shot('image/jpeg', jpeg())],
      ['a WebP', shot('image/webp', webp())],
    ])('should take %s that starts and ends properly', async (_n, s) => {
      expect((await post(body({ screenshots: [s] }))).statusCode).toBe(200);
    });

    it.each([
      [
        'a PNG with a script after its end',
        shot('image/png', Buffer.concat([pngBytes(), Buffer.from('<?php system($_GET[0]); ?>')])),
      ],
      [
        'a PNG cut short (no end chunk)',
        shot('image/png', Buffer.concat([PNG_SIG, Buffer.from('tiny')])),
      ],
      [
        'a JPEG with bytes after its end marker',
        shot('image/jpeg', jpeg([0xff, 0xd9, 0x50, 0x4b, 0x03, 0x04])),
      ],
      ['a JPEG cut short', shot('image/jpeg', jpeg([1, 2]))],
      ['a WebP whose size does not match the file', shot('image/webp', webp(40))],
    ])('should refuse %s', async (_n, s) => {
      const res = await post(body({ screenshots: [s] }));
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/Screenshot 1 is not a valid/);
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('limits beyond the per-address one', () => {
    it('should allow 3 reports in 10 minutes from one account, then 429', async () => {
      for (let i = 0; i < 3; i++) expect((await post(body())).statusCode).toBe(200);
      const res = await post(body());
      expect(res.statusCode).toBe(429);
      expect(res.json().error).toMatch(/Too many reports/);
      expect(send).toHaveBeenCalledTimes(3);
    });

    it('should not count a refused (invalid) report against the account', async () => {
      for (let i = 0; i < 5; i++)
        expect((await post(body({ description: 'short' }))).statusCode).toBe(400);
      expect((await post(body())).statusCode).toBe(200);
    });

    it('should not let invalid requests use up the shared daily cap, even ones with a bad screenshot', async () => {
      const bad = body({ screenshots: [{ name: 'a', type: 'image/png', data: 'not base64!!' }] });
      for (let i = 0; i < 30; i++) {
        const headers = {
          authorization: `Bearer ${app.jwt.sign({ userId: `junk-${i}`, email: `j${i}@example.com` })}`,
        };
        expect((await post(bad, headers)).statusCode).toBe(400);
      }
      expect((await post(body())).statusCode).toBe(200);
    });

    it('should not count a report that was not delivered, so a provider outage does not use up the day', async () => {
      send.mockRejectedValue(new Error('provider down'));
      for (let i = 0; i < 25; i++) {
        const headers = {
          authorization: `Bearer ${app.jwt.sign({ userId: `out-${i}`, email: `o${i}@example.com` })}`,
        };
        expect((await post(body(), headers)).statusCode).toBe(500);
      }
      send.mockResolvedValue({ data: { id: 'x' }, error: null });
      // 25 failed sends later the shared caps (8 an hour, 20 a day) are untouched, and so is this account's own
      for (let i = 0; i < 3; i++) expect((await post(body())).statusCode).toBe(200);
      expect((await post(body())).statusCode).toBe(429);
    });

    it('should count each account on its own', async () => {
      const other = {
        authorization: `Bearer ${app.jwt.sign({ userId: 'u-2', email: 'two@example.com' })}`,
      };
      for (let i = 0; i < 3; i++) await post(body());
      expect((await post(body())).statusCode).toBe(429);
      expect((await post(body(), other)).statusCode).toBe(200);
    });

    it('should stop everyone together at 8 an hour, so many accounts cannot flood the inbox', async () => {
      let refused = 0;
      for (let i = 0; i < 12; i++) {
        const headers = {
          authorization: `Bearer ${app.jwt.sign({ userId: `bot-${i}`, email: `b${i}@example.com` })}`,
        };
        if ((await post(body(), headers)).statusCode === 429) refused += 1;
      }
      expect(refused).toBe(4);
      expect(send).toHaveBeenCalledTimes(8);
    });

    it('should stop everyone together at 20 a day, leaving the e-mail quota for sign-up and reset mail', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const start = Date.now();
        let sent = 0;
        let refused = 0;
        // 30 accounts, one every 20 minutes: never more than 3 an hour, so only the daily cap can stop them
        for (let i = 0; i < 30; i++) {
          vi.setSystemTime(start + i * 20 * 60_000);
          const headers = {
            authorization: `Bearer ${app.jwt.sign({ userId: `day-${i}`, email: `d${i}@example.com` })}`,
          };
          const status = (await post(body(), headers)).statusCode;
          if (status === 200) sent += 1;
          if (status === 429) refused += 1;
        }
        expect(sent).toBe(20);
        expect(refused).toBe(10);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should let one account send 5 in a day, however it spaces them', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const start = Date.now();
        const statuses: number[] = [];
        for (let i = 0; i < 7; i++) {
          vi.setSystemTime(start + i * 30 * 60_000);
          statuses.push((await post(body())).statusCode);
        }
        expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('where it goes', () => {
    it('should only ever e-mail the owner, whatever the body says', async () => {
      await post(body({ email: 'victim@example.org', to: 'victim@example.org', cc: 'x@y.z' }));
      // An unknown field is refused outright; and with a clean body the recipient is the configured one
      expect(send).not.toHaveBeenCalled();
      await post(body());
      const mail = send.mock.calls[0][0];
      expect(mail.to).toBe(config.adminEmail);
      expect(mail.cc).toBeUndefined();
      expect(mail.bcc).toBeUndefined();
    });
  });

  it('should carry a rate limit of 5 per 10 minutes', () => {
    // The limiter itself is not registered in tests (app.ts), so the config is asserted
    expect(REPORT_RATE_LIMIT).toMatchObject({ max: 5, timeWindow: '10 minutes' });
  });
});
