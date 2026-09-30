/**
 * Test hooks — `/api/test/*` (docs/TRADING_TEST_PLAN.md A5). Seeded users, the email outbox and an
 * account reset for end-to-end tests and local reproduction on the fake feed.
 *
 * 🔐 Four guards, all required:
 *   1. ENABLE_TEST_HOOKS=1 in the environment;
 *   2. config.ts refuses to boot with it (or any other test-only variable) in production;
 *   3. app.ts registers these routes only then — otherwise they don't exist (404);
 *   4. every request carries `x-test-hooks-secret` = TEST_HOOKS_SECRET, compared in constant time.
 *
 * Users are created through the real /register and /verify-email handlers (app.inject), so a
 * seeded user is exactly what a sign-up produces.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config.js';
import { ALLOWED_SYMBOLS } from '../../constants.js';
import { outboxFor } from '../../services/emailOutbox.js';
import type { MarginMode } from '../../trading/engine/index.js';

const errorResponse = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' } },
} as const;

/** 🔐 Constant-time: both sides hashed to the same length first */
function secretMatches(given: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(config.testHooksSecret).digest();
  return timingSafeEqual(a, b);
}

async function requireSecret(request: FastifyRequest, reply: FastifyReply) {
  const given = request.headers['x-test-hooks-secret'];
  if (typeof given !== 'string' || !secretMatches(given)) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}

const leverageBySymbol = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(
    ALLOWED_SYMBOLS.map((s) => [s, { type: 'integer', minimum: 1, maximum: 10 }])
  ),
} as const;

interface CreateUserBody {
  email?: string;
  verified?: boolean;
  marginMode?: MarginMode;
  leverage?: Record<string, number>;
}

export async function testHooksRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireSecret);

  // ── POST /users — a signed-up (and by default verified) user ─────────────────
  app.post<{ Body: CreateUserBody }>(
    '/users',
    {
      schema: {
        tags: ['Test'],
        summary: 'Test only: create a user through /register (+ /verify-email)',
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            email: { type: 'string', format: 'email', maxLength: 255 },
            verified: { type: 'boolean' },
            marginMode: { type: 'string', enum: ['ISOLATED_MARGIN', 'REGULAR_MARGIN'] },
            leverage: leverageBySymbol,
          },
        },
        response: {
          201: {
            type: 'object',
            required: ['userId', 'email', 'username', 'password', 'verified'],
            properties: {
              userId: { type: 'string' },
              email: { type: 'string' },
              username: { type: 'string' },
              password: { type: 'string' },
              verified: { type: 'boolean' },
            },
          },
          401: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const b = request.body ?? {};
      const email = b.email ?? `e2e-${randomUUID()}@test.local`;
      const username = `e2e_${randomBytes(6).toString('hex')}`;
      // Meets the password rule: lower, upper, digit, symbol
      const password = `E2e!${randomBytes(12).toString('hex')}`;

      const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email, username, password, acceptedTerms: true },
      });
      if (registered.statusCode !== 201) {
        request.log.error({ status: registered.statusCode }, 'Test hook: register failed');
        throw new Error('register failed');
      }
      const { user } = registered.json<{ user: { id: string } }>();

      const verified = b.verified ?? true;
      if (verified) {
        const link = outboxFor(email).find((e) => e.kind === 'verify-email')?.url;
        const token = link ? new URL(link).searchParams.get('token') : null;
        const res = token
          ? await app.inject({
              method: 'POST',
              url: '/api/auth/verify-email',
              payload: { token },
            })
          : undefined;
        if (res?.statusCode !== 200) {
          request.log.error({ status: res?.statusCode }, 'Test hook: verify-email failed');
          throw new Error('verify-email failed');
        }
      }

      if (b.marginMode) await app.trading.setMarginMode(user.id, b.marginMode);
      for (const [symbol, leverage] of Object.entries(b.leverage ?? {})) {
        await app.trading.setSymbolLeverage(user.id, symbol, leverage);
      }

      return reply.status(201).send({ userId: user.id, email, username, password, verified });
    }
  );

  // ── GET /outbox?to= — the emails "sent" to an address, newest first ──────────
  app.get<{ Querystring: { to: string } }>(
    '/outbox',
    {
      schema: {
        tags: ['Test'],
        summary: 'Test only: the emails sent to an address, newest first',
        querystring: {
          type: 'object',
          required: ['to'],
          additionalProperties: false,
          properties: { to: { type: 'string', format: 'email', maxLength: 255 } },
        },
        response: {
          200: {
            type: 'object',
            required: ['emails'],
            properties: {
              emails: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['to', 'kind', 'sentAt'],
                  properties: {
                    to: { type: 'string' },
                    kind: { type: 'string' },
                    url: { type: 'string' },
                    sentAt: { type: 'number' },
                  },
                },
              },
            },
          },
          401: errorResponse,
        },
      },
    },
    async (request) => ({ emails: outboxFor(request.query.to) })
  );

  // ── POST /users/:id/request-deletion — a pending deletion, as production records one ──
  // Outside production, the real /api/auth/account deletes at once (a dev convenience), so the
  // "scheduled for deletion" banner and its Cancel can't be reached there without this.
  app.post<{ Params: { id: string } }>(
    '/users/:id/request-deletion',
    {
      schema: {
        tags: ['Test'],
        summary:
          'Test only: mark a user as having requested deletion (as production does), signed out',
        params: {
          type: 'object',
          required: ['id'],
          additionalProperties: false,
          properties: { id: { type: 'string', minLength: 1, maxLength: 64 } },
        },
        response: {
          200: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
          401: errorResponse,
        },
      },
    },
    async (request) => {
      const userId = request.params.id;
      await app.prisma.user.updateMany({
        where: { id: userId },
        data: { deletionRequestedAt: new Date() },
      });
      // Production signs the user out with the request
      await app.prisma.refreshToken.deleteMany({ where: { userId } });
      return { ok: true };
    }
  );

  // ── POST /users/:id/reset — the account back to 10,000 USDT, no session needed ──
  app.post<{ Params: { id: string } }>(
    '/users/:id/reset',
    {
      schema: {
        tags: ['Test'],
        summary: 'Test only: reset a user’s paper account (as POST /api/paper/account/reset)',
        params: {
          type: 'object',
          required: ['id'],
          additionalProperties: false,
          properties: { id: { type: 'string', minLength: 1, maxLength: 64 } },
        },
        response: {
          200: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
          401: errorResponse,
        },
      },
    },
    async (request) => {
      await app.trading.reset(request.params.id);
      return { ok: true };
    }
  );
}
