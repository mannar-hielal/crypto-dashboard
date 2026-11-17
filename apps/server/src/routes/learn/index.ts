import type { FastifyInstance } from 'fastify';
import type { LearnItemId, LearnStatus } from '@crypto-dashboard/sdk';
import {
  HABIT_BADGE_IDS,
  LEARN_EVENT_ITEM_IDS,
  LEARN_EVENT_NAMES,
  LEARN_ITEM_IDS,
  LEARN_CHECKPOINT_IDS,
  LEARN_LESSON_IDS,
  CHECKPOINT_VERSION,
  LESSON_FIRST_STEP,
  LESSON_VERSION_SPAN,
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

// A finished lesson keeps its finish's step in the row (its version), but answers without one: it
// no longer has a "furthest screen"
const toItem = (r: ItemRow) => ({
  itemId: r.itemId as LearnItemId,
  status: r.status as LearnStatus,
  ...(r.status === 'started' && typeof r.step === 'number' ? { step: r.step } : {}),
  updatedAt: r.updatedAt.toISOString(),
});

/** The lesson an item id names, or null for a tour, an offer or a checkpoint */
const lessonOf = (itemId: string) =>
  (LEARN_LESSON_IDS as readonly string[]).includes(itemId)
    ? (itemId as (typeof LEARN_LESSON_IDS)[number])
    : null;

/**
 * The lowest `step` of an item's current version: a lesson's first funnel step, a checkpoint's
 * question set version. Null for an item with no versions (a tour, an offer)
 */
const versionFloorOf = (itemId: string): number | null => {
  const lesson = lessonOf(itemId);
  // eslint-disable-next-line security/detect-object-injection -- lesson is from the fixed list
  if (lesson) return LESSON_FIRST_STEP[lesson];
  return (LEARN_CHECKPOINT_IDS as readonly string[]).includes(itemId)
    ? CHECKPOINT_VERSION[itemId as (typeof LEARN_CHECKPOINT_IDS)[number]]
    : null;
};

/**
 * 🔐 The steps of an item's current version, `from` up to (not including) `to`: a lesson's span
 * from its first step, a checkpoint's one question set. Null for an item with no versions. The one
 * rule the write check, the reads and the takeover all use
 */
const versionRange = (itemId: string): { from: number; to: number } | null => {
  const from = versionFloorOf(itemId);
  if (from === null) return null;
  return { from, to: from + (lessonOf(itemId) ? LESSON_VERSION_SPAN : 1) };
};

/** A step outside the item's current version (none counts as outside) */
const outsideVersion = (range: { from: number; to: number }, step: number | null | undefined) =>
  typeof step !== 'number' || step < range.from || step >= range.to;

/**
 * 🔐 A row from another version of a lesson or a checkpoint: no step, or one outside the current
 * version's range. Written by an old client, or by an old API machine during a rolling deploy (the
 * reset migrations run before the old machines are gone), so it never counts.
 */
const isStaleRow = (r: { itemId: string; step?: number | null }) => {
  const range = versionRange(r.itemId);
  return range !== null && outsideVersion(range, r.step);
};

/**
 * A finished Lesson 1 means the welcome card is done with (the reset migration's rule too): saved
 * as its dismissal, inside the caller's transaction, never twice
 */
const dismissWelcomeCard = (
  tx: Pick<FastifyInstance['prisma'], 'learningProgress'>,
  userId: string
) =>
  tx.learningProgress.createMany({
    data: [{ userId, itemId: 'welcome-card', status: 'dismissed' }],
    skipDuplicates: true,
  });

const ROW = { itemId: true, status: true, step: true, updatedAt: true } as const;

/**
 * A lesson's furthest screen is stored as its funnel step number, which includes the lesson's
 * `stepBase`. A rebuild raises it past every step the lesson used before (its last version's
 * `stepBase` + screens; the client's lessons test records them), never lowers it. Room for many
 * rebuilds; a SmallInt column
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
      const items = rows.filter((r) => !isStaleRow(r)).map(toItem);
      // Lesson 1 finished in its earlier version after the reset (an old API machine during the
      // rollout): the welcome card is answered as dismissed, as the migration did for earlier
      // finishes. Saved by the start that takes that row over (PUT), never by this read
      const oldLesson1Done = rows.some(
        (r) => r.itemId === 'lesson-01' && r.status === 'completed' && isStaleRow(r)
      );
      if (oldLesson1Done && !rows.some((r) => r.itemId === 'welcome-card')) {
        items.push(
          toItem({ itemId: 'welcome-card', status: 'dismissed', step: null, updatedAt: new Date() })
        );
      }
      return reply.send({ items });
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
          '`started` takes a lesson and its furthest screen as `step` (the funnel step number); the stored step only rises. ' +
          "A lesson's `completed` takes its last screen's `step` too. A lesson's start or finish from an earlier " +
          'version of it (a step below its first) gets 409.',
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
          409: errorResponse,
        },
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { itemId } = request.params as { itemId: LearnItemId };
      const { status, step } = request.body as { status: LearnStatus; step?: number };
      const lessonId = lessonOf(itemId);
      const range = versionRange(itemId);

      // 🔐 One check of what each kind of item may send, before any write:
      // - a dismissal (an offer, a tour skipped) carries no step, and a lesson or a checkpoint is
      //   never dismissed (such a row would have no version);
      // - a tour or an offer has no versions: no start, no step;
      // - only a lesson is started; a lesson's start and finish say which screen, a checkpoint's
      //   pass its question set; one from an earlier version (no step, or below its floor) is
      //   refused, so a stale client can't undo the resets
      const bad = (error: string) => reply.status(400).send({ error });
      const earlier = () =>
        reply.status(409).send({
          error: lessonId
            ? 'An earlier version of this lesson'
            : 'An earlier version of this checkpoint',
        });
      if (status === 'dismissed') {
        if (range) return bad('A lesson or a checkpoint can’t be dismissed');
        if (step !== undefined) return bad('Only a lesson or a checkpoint takes a step');
      } else if (!range) {
        if (status === 'started') return bad('A start needs a lesson and its step');
        if (step !== undefined) return bad('Only a lesson or a checkpoint takes a step');
      } else if (status === 'started' && (!lessonId || step === undefined)) {
        return bad('A start needs a lesson and its step');
      } else if (outsideVersion(range, step)) {
        // Below the version (or none): an earlier one, 409. 🔐 Past it (a lesson's span, a
        // checkpoint's own set): refused, so no stored step can reach a later version's range
        return step === undefined || step < range.from
          ? earlier()
          : bad('A step past this version');
      }

      // (checked above: a start is a lesson's, with its step; this only narrows the types)
      if (status === 'started' && lessonId && step !== undefined) {
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
        // Not raised: finished, or a step no higher. A finish from an earlier version of the lesson
        // (an old API machine during the rollout) is today's start, taken over only when the row
        // read is one, so the start that changes nothing costs no more. One transaction with Lesson
        // 1's welcome card: that old finish is the only sign the card was done with, so it never
        // goes without the dismissal saved
        if (row && range && isStaleRow(row)) {
          const replaced = await app.prisma.$transaction(async (tx) => {
            const taken = await tx.learningProgress.updateMany({
              where: {
                userId,
                itemId,
                // The same range as isStaleRow: below the version, or past its span
                OR: [{ step: null }, { step: { lt: range.from } }, { step: { gte: range.to } }],
              },
              data: { status, step },
            });
            // Only an old Lesson 1 *finish* means the card is done with (as GET reads it)
            if (taken.count === 1 && itemId === 'lesson-01' && row.status === 'completed') {
              await dismissWelcomeCard(tx, userId);
            }
            return taken;
          });
          if (replaced.count === 1) {
            return reply.send({ item: toItem({ itemId, status, step, updatedAt: new Date() }) });
          }
          // Another request (a second tab) took it over first: answer what is stored now
          const now = await app.prisma.learningProgress.findUnique({
            where: { userId_itemId: { userId, itemId } },
            select: ROW,
          });
          return reply.send({
            item: toItem(now ?? { itemId, status, step, updatedAt: new Date() }),
          });
        }
        return reply.send({
          item: toItem(row ?? { itemId, status, step, updatedAt: new Date() }),
        });
      }

      if (status === 'completed') {
        // A lesson's finish keeps its step: the version it was finished in (a tour's: none). Any
        // step of the current version counts: progress is the learner's own, so a client claiming
        // a finish it didn't reach only changes its own path. A Lesson 1 finish also means the
        // welcome card is done with (the migration's and the takeover's rule): saved with it
        const finish = app.prisma.learningProgress.upsert({
          where: { userId_itemId: { userId, itemId } },
          create: { userId, itemId, status, step: step ?? null },
          update: { status, step: step ?? null },
          select: ROW,
        });
        // One batched transaction (one round trip) for Lesson 1; any other finish is the upsert alone
        const row =
          itemId === 'lesson-01'
            ? (await app.prisma.$transaction([finish, dismissWelcomeCard(app.prisma, userId)]))[0]
            : await finish;
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
            stepId: { type: 'string', pattern: '^[a-z0-9-]+\\.[0-9]{1,3}$', maxLength: 40 },
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
        const isLesson = lessonOf(body.itemId) !== null;
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
          'journal, a tour) — never profit or how often someone trades. Days are the learner’s ' +
          'own (`tz`: their IANA time zone, such as Europe/Zurich; UTC when absent or unknown).',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            // 🔐 Bounded (IANA names are under 40 characters). Any other text is never refused: an
            // unknown zone counts in UTC (`dayCounter`), so an odd device zone keeps the streak
            tz: { type: 'string', maxLength: 64 },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['badges', 'learningDays', 'streakDays', 'thisWeek'],
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
              thisWeek: {
                type: 'array',
                items: { type: 'boolean' },
                minItems: 7,
                maxItems: 7,
                description: 'This week (the learner’s days), Monday first: a learning day or not',
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
        },
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { tz } = request.query as { tz?: string };
      return reply.send(await loadHabits(app.prisma, userId, new Date(), tz));
    }
  );
}
