/**
 * POST /api/reports — a signed-in user's bug report, e-mailed to the owner. Nothing is stored.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { EmailService } from '../../services/EmailService.js';
import { clientIp } from '../../lib/clientIp.js';
import { cleanText, isPlainMailbox, oneLine } from '../../lib/cleanText.js';
import { SlidingWindowLimiter } from '../../lib/slidingLimiter.js';

// ─── LIMITS ─────────────────────────────────────────────────────────────────

/** 🔐 5 reports per 10 minutes per visitor: each one sends an e-mail with attachments */
export const REPORT_RATE_LIMIT = {
  max: 5,
  timeWindow: '10 minutes',
  keyGenerator: (request: FastifyRequest) => clientIp(request),
};

/**
 * 🔐 Beyond the per-address limit above: 3 reports in 10 minutes and 5 a day for one account, and
 * across everyone 8 an hour and 20 a day. The daily figure is the one that matters: Resend's quota is
 * 100 e-mails a day, shared with the verification, reset and deletion mail every user needs (it has been
 * exceeded before, docs/APP_LOG.md), so reports may use only a fifth of it. A script that registers
 * accounts to get past the per-address limit then costs the owner a full inbox at worst, never a day
 * without sign-up e-mails. Each is in memory (`SlidingWindowLimiter`, one Fly machine), checked once
 * the report is valid.
 */
const accountBurst = new SlidingWindowLimiter(3, 10 * 60_000);
const accountDay = new SlidingWindowLimiter(5, 24 * 60 * 60_000);
const everyoneHour = new SlidingWindowLimiter(8, 60 * 60_000, 1);
const everyoneDay = new SlidingWindowLimiter(20, 24 * 60 * 60_000, 1);

/**
 * Takes a slot in all four windows, or in none: a refusal by a later window gives back the hits the
 * earlier ones counted. The returned function gives every slot back, for a send that then failed:
 * a Resend outage must not use up the shared daily cap with reports that were never delivered.
 */
function takeSlots(userId: string): (() => void) | null {
  const windows: [SlidingWindowLimiter, string][] = [
    [accountBurst, userId],
    [accountDay, userId],
    [everyoneHour, 'everyone'],
    [everyoneDay, 'everyone'],
  ];
  const taken: [SlidingWindowLimiter, string][] = [];
  for (const [limiter, key] of windows) {
    if (!limiter.allow(key)) {
      taken.forEach(([l, k]) => l.refund(k));
      return null;
    }
    taken.push([limiter, key]);
  }
  return () => taken.forEach(([l, k]) => l.refund(k));
}

/** For tests: start every window empty */
export function resetReportLimits(): void {
  accountBurst.reset();
  accountDay.reset();
  everyoneHour.reset();
  everyoneDay.reset();
}

/**
 * 🔐 The 6 MB body cap is for this route only (Fastify's default is 1 MB): 3 screenshots of up to
 * 1.5M base64 characters each (4.5 MB) plus the text. Anything bigger is refused with a 413
 * before it is parsed, so the larger cap doesn't widen the rest of the API.
 */
export const REPORT_BODY_LIMIT = 6 * 1024 * 1024;

/** 🔐 A decoded image's cap, whatever its encoded length said */
export const MAX_IMAGE_BYTES = 1_100_000;

const MAX_SCREENSHOTS = 3;

// ─── SCREENSHOTS ────────────────────────────────────────────────────────────

type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';
const EXTENSIONS: Record<ImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** 🔐 The file's own first bytes must match the declared type: the declared type alone proves nothing */
function matchesMagicBytes(type: ImageType, b: Buffer): boolean {
  switch (type) {
    case 'image/png':
      return b.length >= 8 && b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case 'image/jpeg':
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/webp':
      return (
        b.length >= 12 &&
        b.subarray(0, 4).toString('latin1') === 'RIFF' &&
        b.subarray(8, 12).toString('latin1') === 'WEBP'
      );
  }
}

const IHDR = Buffer.from([0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const WEBP_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X']);
const PNG_END = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/** A JPEG's segments, walked from the start, must reach a frame header (SOF) before the picture data */
function jpegHasFrame(b: Buffer): boolean {
  let i = 2;
  while (i + 4 <= b.length && b.readUInt8(i) === 0xff) {
    const marker = b.readUInt8(i + 1);
    if (marker === 0xda || marker === 0xd9) return false; // picture data, or the end, with no frame before it
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return true;
    const length = b.readUInt16BE(i + 2);
    if (length < 2) return false;
    i += 2 + length;
  }
  return false;
}

/**
 * 🔐 The file must also be built like its format, start to end: a PNG opening with IHDR and ending with
 * IEND, a JPEG with a frame header ahead of its picture data and its end marker last, a WebP whose RIFF
 * size is the file's size and whose first chunk is a WebP one. Bytes appended after a valid picture (a
 * script, an archive) are refused. The picture's content is never decoded here, so a file that is built
 * right but is not really an image can still get through: the e-mail says not to open anything unexpected.
 */
function endsProperly(type: ImageType, b: Buffer): boolean {
  switch (type) {
    case 'image/png':
      // The first chunk is IHDR (the header every PNG opens with), the last is IEND
      return (
        b.length >= 8 + IHDR.length + PNG_END.length &&
        b.subarray(8, 8 + IHDR.length).equals(IHDR) &&
        b.subarray(b.length - PNG_END.length).equals(PNG_END)
      );
    case 'image/jpeg':
      return (
        b.length >= 4 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9 && jpegHasFrame(b)
      );
    case 'image/webp':
      // The size the file declares is its size, and its first chunk is a real WebP one
      return (
        b.length >= 16 &&
        b.readUInt32LE(4) + 8 === b.length &&
        WEBP_CHUNKS.has(b.subarray(12, 16).toString('latin1'))
      );
  }
}

/** Decoded and checked, or the reason it is refused */
function decodeScreenshot(
  index: number,
  shot: { type: ImageType; data: string }
): { ok: true; content: Buffer; filename: string } | { ok: false; error: string } {
  const n = index + 1;
  if (shot.data.length === 0 || shot.data.length % 4 !== 0 || !BASE64.test(shot.data)) {
    return { ok: false, error: `Screenshot ${n} is not valid base64 image data` };
  }
  // 🔐 Size is checked from the encoded length first, so an oversized image is never decoded
  if ((shot.data.length / 4) * 3 > MAX_IMAGE_BYTES + 3) {
    return { ok: false, error: `Screenshot ${n} is too large` };
  }
  const content = Buffer.from(shot.data, 'base64');
  if (content.length === 0 || content.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: `Screenshot ${n} is empty or too large` };
  }
  if (!matchesMagicBytes(shot.type, content) || !endsProperly(shot.type, content)) {
    return { ok: false, error: `Screenshot ${n} is not a valid ${shot.type} image` };
  }
  // 🔐 The name is ours, never the client's: no path characters or control characters can reach
  // the attachment header, and the extension comes from the verified type
  return { ok: true, content, filename: `screenshot-${n}.${EXTENSIONS[shot.type]}` };
}

// ─── SHARED RESPONSE SCHEMAS ────────────────────────────────────────────────

const errorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
};

const okResponse = {
  type: 'object',
  required: ['ok'],
  properties: { ok: { type: 'boolean' } },
};

const contextSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'path', 'viewport', 'userAgent'],
  properties: {
    area: { type: 'string', enum: ['chart', 'learning', 'other'] },
    path: { type: 'string', maxLength: 200 },
    symbol: { type: 'string', maxLength: 20 },
    interval: { type: 'string', maxLength: 10 },
    layout: { type: 'string', maxLength: 20 },
    lessonId: { type: 'string', maxLength: 60 },
    lessonScreen: { type: 'integer', minimum: 0, maximum: 500 },
    checkpointId: { type: 'string', maxLength: 60 },
    viewport: { type: 'string', maxLength: 20 },
    userAgent: { type: 'string', maxLength: 300 },
  },
};

const screenshotSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'type', 'data'],
  properties: {
    name: { type: 'string', maxLength: 100 },
    type: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'] },
    data: { type: 'string', maxLength: 1_500_000 },
  },
};

// ─── UNKNOWN-FIELD GUARD ────────────────────────────────────────────────────

// Fastify's default Ajv strips fields a schema doesn't declare (removeAdditional) instead of
// refusing them, so an unknown field is checked here, before validation, against the declared names.
const TOP_KEYS = ['description', 'context', 'screenshots'];
const CONTEXT_KEYS = Object.keys(contextSchema.properties);
const SHOT_KEYS = Object.keys(screenshotSchema.properties);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const unknownKeys = (v: unknown, allowed: string[]) =>
  isObj(v) && Object.keys(v).some((k) => !allowed.includes(k));

function hasUnknownFields(body: unknown): boolean {
  if (!isObj(body)) return false;
  if (unknownKeys(body, TOP_KEYS) || unknownKeys(body.context, CONTEXT_KEYS)) return true;
  return Array.isArray(body.screenshots) && body.screenshots.some((s) => unknownKeys(s, SHOT_KEYS));
}

// ─── ROUTES ─────────────────────────────────────────────────────────────────

interface ReportBody {
  description: string;
  context: Record<string, string | number | undefined> & { area: string };
  screenshots: { name: string; type: ImageType; data: string }[];
}

export async function reportsRoutes(app: FastifyInstance) {
  const log = app.log.child({ route: 'reports' });

  app.post<{ Body: ReportBody }>(
    '',
    {
      onRequest: [app.authenticate],
      bodyLimit: REPORT_BODY_LIMIT,
      config: { rateLimit: REPORT_RATE_LIMIT },
      preValidation: async (request, reply) => {
        if (hasUnknownFields(request.body)) {
          return reply.status(400).send({ error: 'Unknown field in the report' });
        }
      },
      schema: {
        tags: ['Reports'],
        summary: 'Report a bug (e-mailed to the owner)',
        description:
          'Signed-in users only. Sends one e-mail with up to 3 screenshots; nothing is stored.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'context', 'screenshots'],
          properties: {
            description: { type: 'string', minLength: 10, maxLength: 4000 },
            context: contextSchema,
            screenshots: { type: 'array', maxItems: MAX_SCREENSHOTS, items: screenshotSchema },
          },
        },
        response: {
          200: okResponse,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          413: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      // 🔐 The account is read now, by id: the token can outlive an account that was deleted, and a
      // token can be had before an address is verified. Only a verified, live account reports, and the
      // account's own address (not the one typed) is the one the owner can trust.
      const account = await app.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, emailVerifiedAt: true, deletionRequestedAt: true },
      });
      if (!account) return reply.status(401).send({ error: 'Unauthorized' });
      if (account.deletionRequestedAt) {
        return reply
          .status(403)
          .send({ error: 'This account is being deleted and cannot send reports.' });
      }
      if (!account.emailVerifiedAt) {
        return reply
          .status(403)
          .send({ error: 'Verify your email address before sending a report.' });
      }

      // 🔐 The reporter is the account, and the form carries no address: the account's own verified one is
      // the subject and the Reply-To. It is used as a Reply-To only if it is one plain mailbox (an address
      // the owner's reply cannot fan out from); otherwise the mail has no Reply-To and says so.
      const accountEmail = account.email.trim();
      const replyTo = isPlainMailbox(accountEmail) ? accountEmail : null;
      const description = cleanText(request.body.description).trim();
      if (description.length < 10) {
        return reply.status(400).send({ error: 'Describe the problem in at least 10 characters.' });
      }
      const { screenshots } = request.body;
      const context = Object.fromEntries(
        Object.entries(request.body.context).map(([k, v]) => [
          k,
          typeof v === 'string' ? oneLine(v, 300) : v,
        ])
      ) as Record<string, string | number | undefined>;

      const decoded: { filename: string; content: Buffer }[] = [];
      for (const [i, shot] of screenshots.entries()) {
        const result = decodeScreenshot(i, shot);
        if (!result.ok) return reply.status(400).send({ error: result.error });
        decoded.push({ filename: result.filename, content: result.content });
      }

      // 🔐 Counted only for a report that would really be sent (valid text, real pictures): an invalid
      // request must not be a way to use up the shared daily cap and shut real reporters out
      const giveBack = takeSlots(userId);
      if (!giveBack) {
        return reply.status(429).send({ error: 'Too many reports. Try again in a while.' });
      }

      try {
        await EmailService.sendBugReport({
          accountEmail,
          replyTo,
          userId,
          description,
          context,
          screenshots: decoded,
        });
      } catch (err) {
        // 🔐 Never the description, the address or a screenshot: only the error
        giveBack(); // nothing was delivered: the report does not count
        log.error({ err }, 'Failed to send bug report');
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
      return { ok: true };
    }
  );
}
