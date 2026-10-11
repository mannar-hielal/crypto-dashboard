import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { LEARN_ITEM_IDS as SDK_IDS } from '@crypto-dashboard/sdk';
import { LEARN_ITEM_IDS } from '../constants.js';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    const prismaClient = {
      learningProgress: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
        createMany: vi.fn(),
      },
    };
    app.decorate('prisma', prismaClient as never);
  };
  Object.defineProperty(plugin, skipOverride, { value: true });
  return { prismaPlugin: plugin };
});

import { buildApp } from '../app.js';

const AT = new Date('2026-10-11T10:00:00.000Z');

describe('learn item ids', () => {
  it('should be the same list as the SDK (the server cannot import the SDK at runtime)', () => {
    expect([...LEARN_ITEM_IDS]).toEqual([...SDK_IDS]);
  });
});

describe('/api/learn/progress', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    token = app.jwt.sign({ userId: 'user-1', email: 'user@test.com' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it('GET: 401 without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/learn/progress' });
    expect(res.statusCode).toBe(401);
  });

  it('GET: returns only the caller’s items, as ISO dates', async () => {
    vi.mocked(app.prisma.learningProgress.findMany).mockResolvedValueOnce([
      { itemId: 'primer', status: 'completed', updatedAt: AT },
      { itemId: 'welcome-card', status: 'dismissed', updatedAt: AT },
    ] as never);

    const res = await app.inject({ method: 'GET', url: '/api/learn/progress', headers: auth() });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      items: [
        { itemId: 'primer', status: 'completed', updatedAt: AT.toISOString() },
        { itemId: 'welcome-card', status: 'dismissed', updatedAt: AT.toISOString() },
      ],
    });
    expect(app.prisma.learningProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
  });

  it('PUT completed: upserts for the caller', async () => {
    vi.mocked(app.prisma.learningProgress.upsert).mockResolvedValueOnce({
      itemId: 'primer',
      status: 'completed',
      updatedAt: AT,
    } as never);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/learn/progress/primer',
      headers: auth(),
      payload: { status: 'completed' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().item).toEqual({
      itemId: 'primer',
      status: 'completed',
      updatedAt: AT.toISOString(),
    });
    expect(app.prisma.learningProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_itemId: { userId: 'user-1', itemId: 'primer' } },
        create: { userId: 'user-1', itemId: 'primer', status: 'completed' },
        update: { status: 'completed' },
      })
    );
  });

  it('PUT dismissed: only creates, so it never overwrites a completion', async () => {
    vi.mocked(app.prisma.learningProgress.findUnique).mockResolvedValueOnce({
      itemId: 'welcome-card',
      status: 'completed',
      updatedAt: AT,
    } as never);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/learn/progress/welcome-card',
      headers: auth(),
      payload: { status: 'dismissed' },
    });

    expect(res.statusCode).toBe(200);
    expect(app.prisma.learningProgress.upsert).not.toHaveBeenCalled();
    expect(app.prisma.learningProgress.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', itemId: 'welcome-card', status: 'dismissed' }],
      skipDuplicates: true,
    });
    // what the account really holds comes back, not what was asked for
    expect(res.json().item.status).toBe('completed');
  });

  it('PUT: refuses an id outside the allowlist and a bad status, before any write', async () => {
    const put = (url: string, payload: unknown) =>
      app.inject({ method: 'PUT', url, headers: auth(), payload: payload as never });

    expect((await put('/api/learn/progress/nope', { status: 'completed' })).statusCode).toBe(400);
    expect((await put('/api/learn/progress/primer', { status: 'done' })).statusCode).toBe(400);
    expect((await put('/api/learn/progress/primer', {})).statusCode).toBe(400);
    expect(app.prisma.learningProgress.upsert).not.toHaveBeenCalled();
    expect(app.prisma.learningProgress.createMany).not.toHaveBeenCalled();
  });

  it('PUT: an unknown extra field is stripped, never written', async () => {
    vi.mocked(app.prisma.learningProgress.upsert).mockResolvedValueOnce({
      itemId: 'primer',
      status: 'completed',
      updatedAt: AT,
    } as never);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/learn/progress/primer',
      headers: auth(),
      payload: { status: 'completed', userId: 'someone-else' },
    });

    expect(res.statusCode).toBe(200);
    expect(app.prisma.learningProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: 'user-1', itemId: 'primer', status: 'completed' },
      })
    );
  });

  it('PUT: 401 without a token', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/learn/progress/primer',
      payload: { status: 'completed' },
    });
    expect(res.statusCode).toBe(401);
  });
});
