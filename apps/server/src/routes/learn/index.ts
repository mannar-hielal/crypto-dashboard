import type { FastifyInstance } from 'fastify';
import type { LearnItemId, LearnStatus } from '@crypto-dashboard/sdk';
import {
  HABIT_BADGE_IDS,
  LEARN_EVENT_ITEM_IDS,
  LEARN_EVENT_NAMES,
  LEARN_ITEM_IDS,
  LEARN_LESSON_IDS,
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
    status: { type: 'string', enum: ['completed', 'dismissed', 'started'] },
    /** A lesson's furthest screen, as the funnel's step number (`lesson-02.<n>`) */
    step: { type: 'integer' },
    updatedAt: { type: 'string' },
  },
};

interface ItemRow {
  itemId: string;
  status: string;
  step?: number | null;
  updatedAt: Date;
}

const toItem = (r: ItemRow) => ({
  itemId: r.itemId as LearnItemId,
  status: r.status as LearnStatus,
  ...(typeof r.step === 'number' ? { step: r.step } : {}),
  updatedAt: r.updatedAt.toISOString(),
});

const ROW = { itemId: true, status: true, step: true, updatedAt: true } as const;

/**
 * A lesson's furthest screen is stored as its funnel step number, which includes the lesson's
 * `stepBase` (raised by 20 at each rebuild, never lowered). Room for many rebuilds; a SmallInt column
 */
const MAX_STEP = 999;

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
        select: ROW,
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
        summary: 'Mark a tour finished, an offer dismissed, or how far a lesson has got',
        description:
          'Idempotent. `completed` is never downgraded: a dismissal or a start after a completion is a no-op. ' +
          '`started` takes a lesson and its furthest screen as `step` (the funnel step number); the stored step only rises.',
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
          properties: {
            status: { type: 'string', enum: ['completed', 'dismissed', 'started'] },
            step: { type: 'integer', minimum: 1, maximum: MAX_STEP },
          },
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
      const { status, step } = request.body as { status: LearnStatus; step?: number };

      // 🔐 A step belongs to a start only: a finish or a dismissal carrying one is a bad request
      if (status !== 'started' && step !== undefined) {
        return reply.status(400).send({ error: 'Only a start takes a step' });
      }

      if (status === 'started') {
        // 🔐 Only a lesson has screens, and a start always says how far
        if (!(LEARN_LESSON_IDS as readonly string[]).includes(itemId) || step === undefined) {
          return reply.status(400).send({ error: 'A start needs a lesson and its step' });
        }
        // 🔐 Never a downgrade: the row is created if missing, and its step only rises while the
        // lesson is unfinished (a completed row is left as it is)
        const created = await app.prisma.learningProgress.createMany({
          data: [{ userId, itemId, status, step }],
          skipDuplicates: true,
        });
        // A new row, or a raised step: what was asked is what's stored, so no read back
        if (created.count === 1) {
          return reply.send({ item: toItem({ itemId, status, step, updatedAt: new Date() }) });
        }
        const raisedRows = await app.prisma.learningProgress.updateMany({
          where: {
            userId,
            itemId,
            status: 'started',
            OR: [{ step: null }, { step: { lt: step } }],
          },
          data: { step },
        });
        if (raisedRows.count === 1) {
          return reply.send({ item: toItem({ itemId, status, step, updatedAt: new Date() }) });
        }
        const row = await app.prisma.learningProgress.findUnique({
          where: { userId_itemId: { userId, itemId } },
          select: ROW,
        });
        return reply.send({
          item: toItem(row ?? { itemId, status, step, updatedAt: new Date() }),
        });
      }

      if (status === 'completed') {
        const row = await app.prisma.learningProgress.upsert({
          where: { userId_itemId: { userId, itemId } },
          create: { userId, itemId, status },
          // A finished lesson no longer has a "furthest screen"
          update: { status, step: null },
          select: ROW,
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
        select: ROW,
      });
      return reply.send({
        item: toItem(row ?? { itemId, status, step: null, updatedAt: new Date() }),
      });
    }
  );

  // ─── POST /events ─────────────────────────────────────────────────────────
  app.post(
    '/events',
    {
      schema: {
        tags: ['Learn'],
        summary: 'Report a guided-tour or lesson event (the funnel: which step people reach)',
        description:
          'Fire-and-forget. 204 once accepted (a repeated step is not stored again; past the per-user cap the oldest rows are pruned); the body is an ' +
          'allowlist: an event name, a tour or lesson id and a `<item>.<n>` step. `lesson_rated` ' +
          'takes a lesson and `<lesson>.<1–5>`, the rating.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'itemId'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', enum: [...LEARN_EVENT_NAMES] },
            itemId: { type: 'string', enum: [...LEARN_EVENT_ITEM_IDS], maxLength: 40 },
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
      // 🔐 A rating is a lesson's, and a whole number 1–5 — nothing else rides on this event
      if (body.name === 'lesson_rated') {
        const isLesson = (LEARN_LESSON_IDS as readonly string[]).includes(body.itemId);
        const rating = body.stepId ? Number(body.stepId.slice(body.itemId.length + 1)) : NaN;
        if (!isLesson || !Number.isInteger(rating) || rating < 1 || rating > 5) {
          return reply.status(400).send({ error: 'a rating is a lesson and 1–5' });
        }
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
