import type { FastifyInstance } from 'fastify';
import { readUnsubscribeToken } from '../../lib/unsubscribeToken.js';

// ─── SHARED RESPONSE SCHEMAS ────────────────────────────────────────────────

const errorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
};

const settingsResponse = {
  type: 'object',
  required: ['fillEmail'],
  properties: { fillEmail: { type: 'boolean' } },
};

// ─── ROUTES ─────────────────────────────────────────────────────────────────

/**
 * E-mail preferences. Everything here is opt-in and off by default; turning one on records when
 * (the proof of consent, like the terms acceptance). Prefix: /api/notifications.
 */
export async function notificationsRoutes(app: FastifyInstance) {
  // ─── GET (the prefix itself) ──────────────────────────────────────────────────────────────
  app.get(
    '',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'The account’s e-mail preferences',
        security: [{ bearerAuth: [] }],
        response: { 200: settingsResponse, 401: errorResponse },
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        select: { fillEmailOptIn: true },
      });
      return reply.send({ fillEmail: user?.fillEmailOptIn ?? false });
    }
  );

  // ─── PUT (the prefix itself) ──────────────────────────────────────────────────────────────
  app.put(
    '',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Turn the "order filled" e-mail on or off',
        description: 'Turning it on needs a verified e-mail address and records when.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['fillEmail'],
          additionalProperties: false,
          properties: { fillEmail: { type: 'boolean' } },
        },
        response: {
          200: settingsResponse,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { fillEmail } = request.body as { fillEmail: boolean };

      if (fillEmail) {
        const user = await app.prisma.user.findUnique({
          where: { id: userId },
          select: { emailVerifiedAt: true },
        });
        // 🔐 Never mail an address nobody has proved is theirs
        if (!user?.emailVerifiedAt) {
          return reply.status(403).send({ error: 'Verify your e-mail address first' });
        }
      }

      // 🔐 Only when the choice changes: `fillEmailOptInAt` is the proof of consent, so a repeat of
      //    the same answer (a double click, a retry) must not move it. The state in the `where`
      //    makes it idempotent and race-safe — the second of two concurrent requests matches nothing
      await app.prisma.user.updateMany({
        where: { id: userId, fillEmailOptIn: !fillEmail },
        data: { fillEmailOptIn: fillEmail, fillEmailOptInAt: fillEmail ? new Date() : null },
      });
      return reply.send({ fillEmail });
    }
  );

  // ─── POST /unsubscribe ────────────────────────────────────────────────────
  app.post(
    '/unsubscribe',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Stop the "order filled" e-mails from the link in one',
        description: 'Public: the signed token in the e-mail says whose preference it is.',
        body: {
          type: 'object',
          required: ['token'],
          additionalProperties: false,
          properties: { token: { type: 'string', minLength: 10, maxLength: 200 } },
        },
        response: {
          200: { type: 'object', properties: { message: { type: 'string' } } },
          400: errorResponse,
        },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { token } = request.body as { token: string };
      const userId = readUnsubscribeToken(token);
      if (!userId) return reply.status(400).send({ error: 'This link is not valid.' });

      // 🔐 updateMany: a deleted account is a no-op (count 0), never an error; and the answer is
      //    the same either way, so the link can't be used to learn which ids exist
      await app.prisma.user.updateMany({
        where: { id: userId },
        data: { fillEmailOptIn: false, fillEmailOptInAt: null },
      });
      return reply.send({
        message: 'You will no longer get an e-mail when an order of yours fills.',
      });
    }
  );
}
