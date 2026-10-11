import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    const prismaClient = {
      user: { findMany: vi.fn() },
      order: { findMany: vi.fn() },
      journalEntry: { findMany: vi.fn() },
    };
    app.decorate('prisma', prismaClient as never);
  };
  Object.defineProperty(plugin, skipOverride, { value: true });
  return { prismaPlugin: plugin };
});

import { buildApp } from '../app.js';
import { clearRetentionCache } from '../services/RetentionMetrics.js';

describe('GET /api/admin/metrics/retention', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = await buildApp();
    // ADMIN_EMAIL is admin@test.com in vitest.config.ts
    adminToken = app.jwt.sign({ userId: 'admin-1', email: 'admin@test.com' });
    userToken = app.jwt.sign({ userId: 'user-1', email: 'user@test.com' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearRetentionCache();
    vi.mocked(app.prisma.user.findMany).mockResolvedValue([] as never);
    vi.mocked(app.prisma.order.findMany).mockResolvedValue([] as never);
    vi.mocked(app.prisma.journalEntry.findMany).mockResolvedValue([] as never);
  });

  const get = (token?: string) =>
    app.inject({
      method: 'GET',
      url: '/api/admin/metrics/retention',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it('401 without a token, and reads nothing', async () => {
    const res = await get();
    expect(res.statusCode).toBe(401);
    expect(app.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('403 for a signed-in user who is not the admin, and reads nothing', async () => {
    const res = await get(userToken);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Forbidden' });
    expect(app.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('200 for the admin: aggregates only, no identifiers', async () => {
    const created = new Date();
    vi.mocked(app.prisma.user.findMany).mockResolvedValue([
      {
        id: 'u-secret-1',
        createdAt: created,
        emailVerifiedAt: created,
        account: { resetCount: 0, lastReset: created },
      },
    ] as never);

    const res = await get(adminToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.windowWeeks).toBe(12);
    expect(body.cohorts).toHaveLength(12);
    expect(body.totals.signups).toBe(1);
    expect(body.totals.verified).toBe(1);
    expect(res.body).not.toContain('u-secret-1');
  });

  it('leaves the admin and the QA account out of every query', async () => {
    await get(adminToken);
    const where = vi.mocked(app.prisma.user.findMany).mock.calls[0][0]?.where as {
      email: { not: string };
      username: { notIn: string[] };
    };
    expect(where.email).toEqual({ not: 'admin@test.com' });
    expect(where.username.notIn).toContain('cpt_qa_test');
  });

  it('queries only user-placed orders (no engine legs, no liquidations)', async () => {
    await get(adminToken);
    for (const call of vi.mocked(app.prisma.order.findMany).mock.calls) {
      const where = call[0]?.where as { createType: null; orderType: { in: string[] } };
      expect(where.createType).toBeNull();
      expect(where.orderType.in).toEqual(['MARKET', 'LIMIT', 'STOP']);
    }
  });

  it('caches the report: a second call does not query again', async () => {
    await get(adminToken);
    await get(adminToken);
    expect(app.prisma.user.findMany).toHaveBeenCalledTimes(1);
  });
});
