import type { FastifyInstance } from 'fastify';
import type { LearnItemId, LearnStatus } from '@crypto-dashboard/sdk';
import { LEARN_ITEM_IDS } from '../../constants.js';

// ─── SHARED RESPONSE SCHEMAS ────────────────────────────────────────────────

const errorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
};

const itemSchema = {
  type: 'object',
  required: ['itemId', 'status', 'updatedAt'],
  properties: {
    itemId: { type: 'string', enum: [...LEARN_ITEM_IDS] },
    status: { type: 'string', enum: ['completed', 'dismissed'] },
    updatedAt: { type: 'string' },
  },
};

interface ItemRow {
  itemId: string;
  status: string;
  updatedAt: Date;
}

const toItem = (r: ItemRow) => ({
  itemId: r.itemId as LearnItemId,
  status: r.status as LearnStatus,
  updatedAt: r.updatedAt.toISOString(),
});

// ─── ROUTES ─────────────────────────────────────────────────────────────────

/**
 * What the account remembers about the guided tours. The item ids are an allowlist, so a user holds
 * at most `LEARN_ITEM_IDS.length` rows: nothing here can grow.
 */
export async function learnRoutes(app: FastifyInstance) {
  // ─── GET /progress ────────────────────────────────────────────────────────
  app.get(
    '/progress',
    {
      schema: {
        tags: ['Learn'],
        summary: 'The tours this account has finished and the offers it has dismissed',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            required: ['items'],
            properties: { items: { type: 'array', items: itemSchema } },
          },
          401: errorResponse,
        },
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const rows = await app.prisma.learningProgress.findMany({
        where: { userId },
        select: { itemId: true, status: true, updatedAt: true },
      });
      return reply.send({ items: rows.map(toItem) });
    }
  );

  // ─── PUT /progress/:itemId ────────────────────────────────────────────────
  app.put(
    '/progress/:itemId',
    {
      schema: {
        tags: ['Learn'],
        summary: 'Mark a tour finished or the welcome card dismissed',
        description:
          'Idempotent. `completed` is never downgraded: a dismissal after a completion is a no-op.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['itemId'],
          additionalProperties: false,
          properties: { itemId: { type: 'string', enum: [...LEARN_ITEM_IDS], maxLength: 40 } },
        },
        body: {
          type: 'object',
          required: ['status'],
          additionalProperties: false,
          properties: { status: { type: 'string', enum: ['completed', 'dismissed'] } },
        },
        response: {
          200: {
            type: 'object',
            required: ['item'],
            properties: { item: itemSchema },
          },
          400: errorResponse,
          401: errorResponse,
        },
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { itemId } = request.params as { itemId: LearnItemId };
      const { status } = request.body as { status: LearnStatus };

      if (status === 'completed') {
        const row = await app.prisma.learningProgress.upsert({
          where: { userId_itemId: { userId, itemId } },
          create: { userId, itemId, status },
          update: { status },
          select: { itemId: true, status: true, updatedAt: true },
        });
        return reply.send({ item: toItem(row) });
      }

      // 🔐 A dismissal only creates the row: it never overwrites a completion
      await app.prisma.learningProgress.createMany({
        data: [{ userId, itemId, status }],
        skipDuplicates: true,
      });
      const row = await app.prisma.learningProgress.findUnique({
        where: { userId_itemId: { userId, itemId } },
        select: { itemId: true, status: true, updatedAt: true },
      });
      return reply.send({ item: toItem(row ?? { itemId, status, updatedAt: new Date() }) });
    }
  );
}
