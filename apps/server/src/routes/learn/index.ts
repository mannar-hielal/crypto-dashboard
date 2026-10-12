import type { FastifyInstance } from 'fastify';
import type { LearnItemId, LearnStatus } from '@crypto-dashboard/sdk';
import {
  HABIT_BADGE_IDS,
  LEARN_EVENT_NAMES,
  LEARN_ITEM_IDS,
  LEARN_TOUR_IDS,
} from '../../constants.js';
import { loadHabits } from '../../services/Habits.js';
import { recordLearningEvent } from '../../services/LearningEvents.js';

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

  // ─── POST /events ─────────────────────────────────────────────────────────
  app.post(
    '/events',
    {
      schema: {
        tags: ['Learn'],
        summary: 'Report a guided-tour event (the funnel: which step people reach)',
        description:
          'Fire-and-forget. 204 once accepted (a repeated step is not stored again; past the per-user cap the oldest rows are pruned); the body is an ' +
          'allowlist: an event name, a tour id and a `<tour>.<n>` step.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'itemId'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', enum: [...LEARN_EVENT_NAMES] },
            itemId: { type: 'string', enum: [...LEARN_TOUR_IDS], maxLength: 40 },
            stepId: { type: 'string', pattern: '^[a-z0-9-]+\\.[0-9]{1,2}$', maxLength: 40 },
          },
        },
        response: { 204: { type: 'null' }, 400: errorResponse, 401: errorResponse },
      },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const body = request.body as { name: string; itemId: string; stepId?: string };
      // 🔐 A step belongs to the tour it names: `primer.3` on `buy-first-coin` is nonsense
      if (body.stepId && !body.stepId.startsWith(`${body.itemId}.`)) {
        return reply.status(400).send({ error: 'stepId does not belong to the tour' });
      }
      await recordLearningEvent(app.prisma, { userId, ...body });
      return reply.status(204).send();
    }
  );

  // ─── GET /habits ──────────────────────────────────────────────────────────
  app.get(
    '/habits',
    {
      schema: {
        tags: ['Learn'],
        summary: 'Habit badges and the learning streak',
        description:
          'Counted from rows the account already has. Badges are careful habits (a stop-loss, a ' +
          'journal, a tour) — never profit or how often someone trades.',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            required: ['badges', 'learningDays', 'streakDays'],
            properties: {
              badges: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'earned', 'progress', 'target'],
                  properties: {
                    id: { type: 'string', enum: [...HABIT_BADGE_IDS] },
                    earned: { type: 'boolean' },
                    progress: { type: 'integer' },
                    target: { type: 'integer' },
                  },
                },
              },
              learningDays: { type: 'integer' },
              streakDays: { type: 'integer' },
            },
          },
          401: errorResponse,
        },
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      return reply.send(await loadHabits(app.prisma, userId));
    }
  );
}
