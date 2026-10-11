import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  HABIT_BADGE_IDS as SDK_BADGES,
  LEARN_EVENT_NAMES as SDK_EVENT_NAMES,
  LEARN_ITEM_IDS as SDK_IDS,
} from '@crypto-dashboard/sdk';
import {
  HABIT_BADGE_IDS,
  LEARN_EVENT_NAMES,
  LEARN_ITEM_IDS,
  LEARN_TOUR_IDS,
} from '../constants.js';

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
      learningEvent: {
        count: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
      },
      order: { count: vi.fn() },
      journalEntry: { findMany: vi.fn() },
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

describe('habit badge ids', () => {
  it('should be the same list as the SDK', () => {
    expect([...HABIT_BADGE_IDS]).toEqual([...SDK_BADGES]);
  });
});

describe('learn event names and tours', () => {
  it('should match the SDK, and the tours should be the items without the card', () => {
    expect([...LEARN_EVENT_NAMES]).toEqual([...SDK_EVENT_NAMES]);
    expect([...LEARN_TOUR_IDS]).toEqual(
      LEARN_ITEM_IDS.filter((i) => i !== 'welcome-card' && i !== 'fill-email-offer')
    );
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

describe('POST /api/learn/events', () => {
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
    vi.mocked(app.prisma.learningEvent.count).mockResolvedValue(0 as never);
    vi.mocked(app.prisma.learningEvent.create).mockResolvedValue({} as never);
  });

  const post = (payload: unknown, withToken = true) =>
    app.inject({
      method: 'POST',
      url: '/api/learn/events',
      headers: withToken ? { authorization: `Bearer ${token}` } : {},
      payload: payload as never,
    });

  it('should store an event for the caller and answer 204', async () => {
    const res = await post({ name: 'tour_step', itemId: 'primer', stepId: 'primer.3' });

    expect(res.statusCode).toBe(204);
    expect(app.prisma.learningEvent.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', name: 'tour_step', itemId: 'primer', stepId: 'primer.3' },
    });
  });

  it('should answer 401 without a token, and store nothing', async () => {
    const res = await post({ name: 'tour_started', itemId: 'primer' }, false);
    expect(res.statusCode).toBe(401);
    expect(app.prisma.learningEvent.create).not.toHaveBeenCalled();
  });

  it('should refuse a name, tour or step outside the allowlist', async () => {
    expect((await post({ name: 'page_view', itemId: 'primer' })).statusCode).toBe(400);
    expect((await post({ name: 'tour_started', itemId: 'welcome-card' })).statusCode).toBe(400);
    expect((await post({ name: 'tour_step', itemId: 'primer', stepId: 'x y' })).statusCode).toBe(
      400
    );
    expect(app.prisma.learningEvent.create).not.toHaveBeenCalled();
  });

  it('should refuse a step that belongs to another tour', async () => {
    const res = await post({ name: 'tour_step', itemId: 'primer', stepId: 'buy-first-coin.2' });
    expect(res.statusCode).toBe(400);
    expect(app.prisma.learningEvent.create).not.toHaveBeenCalled();
  });

  it('should drop the event, with a 204, once the user holds the cap', async () => {
    vi.mocked(app.prisma.learningEvent.count).mockResolvedValue(500 as never);
    const res = await post({ name: 'tour_started', itemId: 'primer' });

    expect(res.statusCode).toBe(204);
    expect(app.prisma.learningEvent.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/learn/habits', () => {
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
    vi.mocked(app.prisma.order.count).mockResolvedValue(2 as never);
    vi.mocked(app.prisma.journalEntry.findMany).mockResolvedValue([] as never);
    vi.mocked(app.prisma.learningEvent.findMany).mockResolvedValue([] as never);
    vi.mocked(app.prisma.learningProgress.findMany).mockResolvedValue([] as never);
    (app.prisma.learningProgress as unknown as { count: ReturnType<typeof vi.fn> }).count = vi
      .fn()
      .mockResolvedValue(1);
  });

  it('should answer 401 without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/learn/habits' });
    expect(res.statusCode).toBe(401);
  });

  it('should count only the caller’s user-placed, stop-loss orders and tours', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/learn/habits',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.badges.find((b: { id: string }) => b.id === 'first-stop-loss').earned).toBe(true);
    expect(body.badges.find((b: { id: string }) => b.id === 'first-tour').earned).toBe(true);
    expect(app.prisma.order.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        createType: null,
        orderType: { in: ['MARKET', 'LIMIT', 'STOP'] },
        stopLoss: { not: null },
      },
    });
  });
});
