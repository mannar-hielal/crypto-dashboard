import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../lib/requireAdmin.js';
import { getRetentionReport } from '../../services/RetentionMetrics.js';

// ─── SHARED RESPONSE SCHEMAS ────────────────────────────────────────────────

const errorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
};

const rateSchema = {
  type: 'object',
  required: ['eligible', 'count'],
  properties: {
    eligible: { type: 'integer' },
    count: { type: 'integer' },
  },
};

const cohortSchema = {
  type: 'object',
  required: [
    'weekStart',
    'signups',
    'verified',
    'activated',
    'medianHoursToFirstOrder',
    'activeWeek1',
    'activeWeek2',
    'activeWeek4',
    'resetUsers',
    'firstOrderWithStopLoss',
  ],
  properties: {
    weekStart: { type: 'string', nullable: true },
    signups: { type: 'integer' },
    verified: { type: 'integer' },
    activated: rateSchema,
    medianHoursToFirstOrder: { type: 'number', nullable: true },
    activeWeek1: rateSchema,
    activeWeek2: rateSchema,
    activeWeek4: rateSchema,
    resetUsers: { type: 'integer' },
    firstOrderWithStopLoss: rateSchema,
  },
};

// ─── ROUTES ─────────────────────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance) {
  // ─── GET /metrics/retention ───────────────────────────────────────────────
  app.get(
    '/metrics/retention',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Retention metrics by weekly signup cohort (admin)',
        description:
          'Aggregates only, from existing tables: signups, activation, return by week. ' +
          'Cached for 10 minutes. Admin only.',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            required: [
              'generatedAt',
              'windowWeeks',
              'truncated',
              'activityTrackedSince',
              'totals',
              'cohorts',
            ],
            properties: {
              generatedAt: { type: 'string' },
              windowWeeks: { type: 'integer' },
              truncated: { type: 'boolean' },
              activityTrackedSince: { type: 'string', nullable: true },
              totals: cohortSchema,
              cohorts: { type: 'array', items: cohortSchema },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
      onRequest: [app.authenticate, requireAdmin],
    },
    async (_request, reply) => {
      return reply.send(await getRetentionReport(app.prisma));
    }
  );
}
