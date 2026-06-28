import { createHash, randomBytes } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { EmailService } from '../../services/EmailService.js';
import { config } from '../../config.js';
import type { SubscriberStatus } from '../../../generated/prisma/client.js';
import type { FastifyRequest } from 'fastify';

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
  // ─── GET /subscribers ─────────────────────────────────────────────────────
  app.get(
    '/subscribers',
    {
      schema: {
        tags: ['Newsletter'],
        summary: 'List all subscribers (admin)',
        description: 'Returns all newsletter subscribers. Auth-protected.',
        headers: {
          type: 'object',
          properties: {
            Authorization: { type: 'string' },
          },
          required: ['Authorization'],
        },
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'verified', 'unsubscribed'],
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              subscribers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    status: { type: 'string' },
                    createdAt: { type: 'string' },
                    verifiedAt: { type: 'string', nullable: true },
                  },
                },
              },
              total: { type: 'integer' },
            },
          },
        },
      },
      onRequest: [app.authenticate],
    },
    async (request: FastifyRequest, reply) => {
      const user = request.user as { userId: string; email: string } | undefined;
      if (!user || user.email !== config.adminEmail) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const { status } = request.query as { status?: SubscriberStatus };

      const where = status ? { status } : {};
      const subscribers = await app.prisma.subscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, status: true, createdAt: true, verifiedAt: true },
      });

      return reply.send({ subscribers, total: subscribers.length });
    }
  );

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
          const existing = await app.prisma.subscriber.findUnique({
            where: { email: email.toLowerCase() },
          });

          if (!existing) {
            request.log.error({ err }, 'Subscriber create failed with P2002 but no record found');
            return reply.status(500).send({ error: 'Internal Server Error' });
          }

          if (existing.status === 'unsubscribed') {
            await app.prisma.subscriber.update({
              where: { id: existing.id },
              data: { status: 'pending', tokenHash, consentIp: ip, verifiedAt: null },
            });
          } else {
            return reply.send({ message: 'Check your inbox — you are already subscribed.' });
          }
        } else {
          request.log.error({ err }, 'Failed to create subscriber');
          return reply.status(500).send({ error: 'Internal Server Error' });
        }
      }

      const verifyUrl = `${config.clientUrl}/newsletter/verify?token=${token}`;
      const unsubscribeUrl = `${config.clientUrl}/newsletter/unsubscribe?token=${token}`;

      await EmailService.sendNewsletterConfirmation(email, verifyUrl, unsubscribeUrl);

      return reply.send({ message: 'Check your inbox to confirm your subscription.' });
    }
  );

  // ─── POST /verify ──────────────────────────────────────────────────────────
  app.post(
    '/verify',
    {
      schema: {
        tags: ['Newsletter'],
        summary: 'Verify email subscription',
        description: 'Double-opt-in confirmation — marks subscriber as verified.',
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
        response: {
          200: messageResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { token } = request.body as { token: string };
      const tokenHash = hashToken(token);

      const subscriber = await app.prisma.subscriber.findUnique({
        where: { tokenHash },
      });

      if (!subscriber) {
        return reply.status(404).send({ error: 'Invalid or expired link.' });
      }

      if (subscriber.status === 'verified') {
        return reply.send({ message: 'Email already verified.' });
      }

      await app.prisma.subscriber.update({
        where: { id: subscriber.id },
        data: { status: 'verified', verifiedAt: new Date() },
      });

      return reply.send({ message: 'Email verified. You are on the waitlist!' });
    }
  );

  // ─── POST /unsubscribe ─────────────────────────────────────────────────────
  app.post(
    '/unsubscribe',
    {
      schema: {
        tags: ['Newsletter'],
        summary: 'Unsubscribe from waitlist',
        description: 'One-click unsubscribe from email link.',
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
        response: {
          200: messageResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { token } = request.body as { token: string };
      const tokenHash = hashToken(token);

      const subscriber = await app.prisma.subscriber.findUnique({
        where: { tokenHash },
      });

      if (!subscriber) {
        return reply.status(404).send({ error: 'Invalid link.' });
      }

      if (subscriber.status === 'unsubscribed') {
        return reply.send({ message: 'You are already unsubscribed.' });
      }

      await app.prisma.subscriber.update({
        where: { id: subscriber.id },
        data: { status: 'unsubscribed' },
      });

      return reply.send({ message: 'You have been unsubscribed.' });
    }
  );
}
