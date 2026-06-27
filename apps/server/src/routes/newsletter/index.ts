import { createHash, randomBytes } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { EmailService } from '../../services/EmailService.js';
import { config } from '../../config.js';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── SHARED RESPONSE SCHEMAS ────────────────────────────────────────────────

const messageResponse = {
  type: 'object',
  properties: {
    message: { type: 'string' },
  },
};

const errorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
};

// ─── ROUTES ─────────────────────────────────────────────────────────────────

export async function newsletterRoutes(app: FastifyInstance) {
  // ─── POST /subscribe ───────────────────────────────────────────────────────
  app.post(
    '/subscribe',
    {
      schema: {
        tags: ['Newsletter'],
        summary: 'Subscribe to launch waitlist',
        description:
          'Stores email with pending status and sends double-opt-in confirmation via Resend.',
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
        response: {
          200: messageResponse,
          400: errorResponse,
          500: errorResponse,
        },
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body as { email: string };

      if (!email || !EMAIL_REGEX.test(email)) {
        return reply.status(400).send({ error: 'Invalid email address' });
      }

      const token = generateToken();
      const tokenHash = hashToken(token);
      const ip = request.ip;

      try {
        await app.prisma.subscriber.create({
          data: {
            email: email.toLowerCase(),
            tokenHash,
            consentIp: ip,
            status: 'pending',
          },
        });
      } catch (err: unknown) {
        const prismaErr = err as { code?: string };
        // P2002 = unique constraint violation — email already exists
        if (prismaErr.code === 'P2002') {
          return reply.send({ message: 'Check your inbox — you are already subscribed.' });
        }
        request.log.error({ err }, 'Failed to create subscriber');
        return reply.status(500).send({ error: 'Internal Server Error' });
      }

      const verifyUrl = `${config.clientUrl}/api/newsletter/verify?token=${token}`;
      const unsubscribeUrl = `${config.clientUrl}/api/newsletter/unsubscribe?token=${token}`;

      await EmailService.sendNewsletterConfirmation(email, verifyUrl, unsubscribeUrl);

      return reply.send({ message: 'Check your inbox to confirm your subscription.' });
    }
  );

  // ─── GET /verify ───────────────────────────────────────────────────────────
  app.get(
    '/verify',
    {
      schema: {
        tags: ['Newsletter'],
        summary: 'Verify email subscription',
        description: 'Double-opt-in confirmation — marks subscriber as verified.',
        querystring: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.query as { token: string };
      const tokenHash = hashToken(token);

      const subscriber = await app.prisma.subscriber.findUnique({
        where: { tokenHash },
      });

      if (!subscriber) {
        return reply.status(404).send({ error: 'Invalid or expired link.' });
      }

      if (subscriber.status === 'verified') {
        return reply.redirect(`${config.clientUrl}/?verified=true`, 302);
      }

      await app.prisma.subscriber.update({
        where: { id: subscriber.id },
        data: { status: 'verified', verifiedAt: new Date() },
      });

      return reply.redirect(`${config.clientUrl}/?verified=true`, 302);
    }
  );

  // ─── GET /unsubscribe ──────────────────────────────────────────────────────
  app.get(
    '/unsubscribe',
    {
      schema: {
        tags: ['Newsletter'],
        summary: 'Unsubscribe from waitlist',
        description: 'One-click unsubscribe from email link.',
        querystring: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.query as { token: string };
      const tokenHash = hashToken(token);

      const subscriber = await app.prisma.subscriber.findUnique({
        where: { tokenHash },
      });

      if (!subscriber) {
        return reply.status(404).send({ error: 'Invalid link.' });
      }

      if (subscriber.status === 'unsubscribed') {
        return reply.redirect(`${config.clientUrl}/?unsubscribed=true`, 302);
      }

      await app.prisma.subscriber.update({
        where: { id: subscriber.id },
        data: { status: 'unsubscribed' },
      });

      return reply.redirect(`${config.clientUrl}/?unsubscribed=true`, 302);
    }
  );
}
