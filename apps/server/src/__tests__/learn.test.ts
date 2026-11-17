import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { CHECKPOINT_VERSIONS, LESSON_FIRST_STEPS } from '@crypto-dashboard/sdk';
import { CHECKPOINT_VERSION, LESSON_FIRST_STEP } from '../constants.js';
import type { FastifyInstance } from 'fastify';
import {
  HABIT_BADGE_IDS as SDK_BADGES,
  LEARN_EVENT_NAMES as SDK_EVENT_NAMES,
  LEARN_ITEM_IDS as SDK_IDS,
} from '@crypto-dashboard/sdk';
import {
  HABIT_BADGE_IDS,
  LEARN_CHECKPOINT_IDS,
  LEARN_EVENT_ITEM_IDS,
  LEARN_EVENT_NAMES,
  LEARN_ITEM_IDS,
  LEARN_LESSON_IDS,
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
        updateMany: vi.fn(),
      },
      learningEvent: {
        count: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        deleteMany: vi.fn(),
      },
      order: { count: vi.fn() },
      journalEntry: { findMany: vi.fn() },
      user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaClient)),
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

describe('learn event items', () => {
  it('should accept events for every tour and lesson, and for no offer', () => {
    expect([...LEARN_EVENT_ITEM_IDS]).toEqual([...LEARN_TOUR_IDS, ...LEARN_LESSON_IDS]);
    for (const id of LEARN_EVENT_ITEM_IDS) expect(LEARN_ITEM_IDS).toContain(id);
    expect(LEARN_EVENT_ITEM_IDS).not.toContain('welcome-card');
  });
});

describe('habit badge ids', () => {
  it('should be the same list as the SDK', () => {
    expect([...HABIT_BADGE_IDS]).toEqual([...SDK_BADGES]);
  });
});

describe('learn event names and tours', () => {
  it('should match the SDK, and the tours and lessons should be the items without the offers', () => {
    expect([...LEARN_EVENT_NAMES]).toEqual([...SDK_EVENT_NAMES]);
    expect([...LEARN_TOUR_IDS, ...LEARN_LESSON_IDS, ...LEARN_CHECKPOINT_IDS]).toEqual(
      LEARN_ITEM_IDS.filter((i) => i !== 'welcome-card' && i !== 'fill-email-offer')
    );
    for (const id of LEARN_CHECKPOINT_IDS) expect(LEARN_EVENT_ITEM_IDS).not.toContain(id);
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

  it('GET: should leave out a lesson row when it is from an earlier version of the lesson', async () => {
    // Written by an old client or an old API machine during the rollout: never counted
    vi.mocked(app.prisma.learningProgress.findMany).mockResolvedValueOnce([
      { itemId: 'lesson-01', status: 'completed', step: null, updatedAt: AT },
      { itemId: 'lesson-ownership', status: 'started', step: 24, updatedAt: AT },
      { itemId: 'lesson-02', status: 'completed', step: 81, updatedAt: AT },
      { itemId: 'primer', status: 'completed', step: null, updatedAt: AT },
      // A pass of chapter 1's earlier questions, and one of today's
      { itemId: 'checkpoint-ch1', status: 'completed', step: null, updatedAt: AT },
    ] as never);
    const res = await app.inject({ method: 'GET', url: '/api/learn/progress', headers: auth() });
    expect(res.json()).toEqual({
      items: [
        // A finish answers without its step
        { itemId: 'lesson-02', status: 'completed', updatedAt: AT.toISOString() },
        { itemId: 'primer', status: 'completed', updatedAt: AT.toISOString() },
        // The hidden Lesson 1 finish still keeps the welcome card shut (the next test)
        expect.objectContaining({ itemId: 'welcome-card', status: 'dismissed' }),
      ],
    });
  });

  it('GET: should keep the welcome card dismissed when Lesson 1 was finished in an earlier version', async () => {
    // Finished on an old API machine after the reset migration ran: hidden, but the card stays shut
    vi.mocked(app.prisma.learningProgress.findMany).mockResolvedValueOnce([
      { itemId: 'lesson-01', status: 'completed', step: null, updatedAt: AT },
    ] as never);
    const res = await app.inject({ method: 'GET', url: '/api/learn/progress', headers: auth() });
    expect(res.json().items).toEqual([
      expect.objectContaining({ itemId: 'welcome-card', status: 'dismissed' }),
    ]);
    // Saved, so it stays shut after a start replaces the old finish
    expect(app.prisma.learningProgress.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', itemId: 'welcome-card', status: 'dismissed' }],
      skipDuplicates: true,
    });
  });

  it('GET: should still answer the dismissal when saving it fails', async () => {
    vi.mocked(app.prisma.learningProgress.findMany).mockResolvedValueOnce([
      { itemId: 'lesson-01', status: 'completed', step: null, updatedAt: AT },
    ] as never);
    vi.mocked(app.prisma.learningProgress.createMany).mockRejectedValueOnce(new Error('db down'));
    const res = await app.inject({ method: 'GET', url: '/api/learn/progress', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([
      expect.objectContaining({ itemId: 'welcome-card', status: 'dismissed' }),
    ]);
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
        create: { userId: 'user-1', itemId: 'primer', status: 'completed', step: null },
        update: { status: 'completed', step: null },
      })
    );
  });

  it('PUT completed: records a passed chapter checkpoint', async () => {
    vi.mocked(app.prisma.learningProgress.upsert).mockResolvedValueOnce({
      itemId: 'checkpoint-ch1',
      status: 'completed',
      updatedAt: AT,
    } as never);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/learn/progress/checkpoint-ch1',
      headers: auth(),
      payload: { status: 'completed', step: 2 }, // its question set's version
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().item.itemId).toBe('checkpoint-ch1');
    expect(app.prisma.learningProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { status: 'completed', step: 2 } })
    );
  });

  it('PUT: should refuse a checkpoint pass when it is from an earlier question set (owner 2026-11-17)', async () => {
    const put = (payload: unknown) =>
      app.inject({
        method: 'PUT',
        url: '/api/learn/progress/checkpoint-ch1',
        headers: auth(),
        payload: payload as never,
      });
    expect((await put({ status: 'completed' })).statusCode).toBe(409);
    expect((await put({ status: 'completed', step: 1 })).json()).toEqual({
      error: 'An earlier version of this checkpoint',
    });
    // Never begun or dismissed
    expect((await put({ status: 'started', step: 2 })).statusCode).toBe(400);
    expect((await put({ status: 'dismissed' })).statusCode).toBe(400);
    expect(app.prisma.learningProgress.upsert).not.toHaveBeenCalled();
    expect(app.prisma.learningProgress.createMany).not.toHaveBeenCalled();
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
        create: { userId: 'user-1', itemId: 'primer', status: 'completed', step: null },
      })
    );
  });

  it('PUT started: records how far a lesson has got, and the step only rises', async () => {
    // The row exists: the step is raised, and what was asked comes back without a read
    vi.mocked(app.prisma.learningProgress.createMany).mockResolvedValueOnce({ count: 0 });
    vi.mocked(app.prisma.learningProgress.updateMany).mockResolvedValueOnce({ count: 1 });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/learn/progress/lesson-02',
      headers: auth(),
      payload: { status: 'started', step: 76 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().item).toMatchObject({ itemId: 'lesson-02', status: 'started', step: 76 });
    expect(app.prisma.learningProgress.findUnique).not.toHaveBeenCalled();
    // Created if missing; otherwise raised only while unfinished and only to a higher step
    expect(app.prisma.learningProgress.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', itemId: 'lesson-02', status: 'started', step: 76 }],
      skipDuplicates: true,
    });
    expect(app.prisma.learningProgress.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        itemId: 'lesson-02',
        status: 'started',
        OR: [{ step: null }, { step: { lt: 76 } }],
      },
      data: { step: 76 },
    });
    expect(app.prisma.learningProgress.upsert).not.toHaveBeenCalled();
    // Raised: no earlier-version check (off the path every screen takes)
    expect(app.prisma.learningProgress.updateMany).toHaveBeenCalledTimes(1);
  });

  it('PUT started: should take over a row when it is from an earlier version of the lesson', async () => {
    // Finished in the old lesson (an old API machine during the rollout): today's start replaces it
    vi.mocked(app.prisma.learningProgress.createMany).mockResolvedValueOnce({ count: 0 });
    vi.mocked(app.prisma.learningProgress.updateMany)
      .mockResolvedValueOnce({ count: 0 }) // not raised: the row is a finish
      .mockResolvedValueOnce({ count: 1 }); // from an earlier version: replaced
    const res = await app.inject({
      method: 'PUT',
      url: '/api/learn/progress/lesson-01',
      headers: auth(),
      payload: { status: 'started', step: 64 },
    });
    expect(res.json().item).toMatchObject({ itemId: 'lesson-01', status: 'started', step: 64 });
    expect(app.prisma.learningProgress.updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', itemId: 'lesson-01', OR: [{ step: null }, { step: { lt: 61 } }] },
      data: { status: 'started', step: 64 },
    });
    expect(app.prisma.learningProgress.findUnique).not.toHaveBeenCalled();
    // It was Lesson 1's earlier finish: the welcome card stays shut
    expect(app.prisma.learningProgress.createMany).toHaveBeenLastCalledWith({
      data: [{ userId: 'user-1', itemId: 'welcome-card', status: 'dismissed' }],
      skipDuplicates: true,
    });
    // Both writes in one transaction: the old finish never goes without the dismissal saved
    expect(app.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('PUT started: a finished lesson stays finished', async () => {
    // No row from an earlier version to replace
    vi.mocked(app.prisma.learningProgress.updateMany).mockResolvedValueOnce({ count: 0 });
    vi.mocked(app.prisma.learningProgress.createMany).mockResolvedValueOnce({ count: 0 });
    vi.mocked(app.prisma.learningProgress.updateMany).mockResolvedValueOnce({ count: 0 });
    vi.mocked(app.prisma.learningProgress.findUnique).mockResolvedValueOnce({
      itemId: 'lesson-01',
      status: 'completed',
      step: 82,
      updatedAt: AT,
    } as never);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/learn/progress/lesson-01',
      headers: auth(),
      payload: { status: 'started', step: 83 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item).toEqual({
      itemId: 'lesson-01',
      status: 'completed',
      updatedAt: AT.toISOString(),
    });
  });

  it('PUT started: refuses a tour, a missing step and a step out of range, before any write', async () => {
    const put = (url: string, payload: unknown) =>
      app.inject({ method: 'PUT', url, headers: auth(), payload: payload as never });

    expect(
      (await put('/api/learn/progress/primer', { status: 'started', step: 2 })).statusCode
    ).toBe(400);
    expect((await put('/api/learn/progress/lesson-02', { status: 'started' })).statusCode).toBe(
      400
    );
    expect(
      (await put('/api/learn/progress/lesson-02', { status: 'started', step: 0 })).statusCode
    ).toBe(400);
    expect(
      (await put('/api/learn/progress/lesson-02', { status: 'started', step: 1000 })).statusCode
    ).toBe(400);
    // A step only with a lesson's start or finish: never a dismissal or a tour's finish
    expect(
      (await put('/api/learn/progress/lesson-02', { status: 'dismissed', step: 70 })).statusCode
    ).toBe(400);
    // A lesson is never dismissed, with or without a step
    expect((await put('/api/learn/progress/lesson-02', { status: 'dismissed' })).statusCode).toBe(
      400
    );
    expect(
      (await put('/api/learn/progress/primer', { status: 'completed', step: 2 })).statusCode
    ).toBe(400);
    expect(
      (await put('/api/learn/progress/lesson-02', { status: 'started', step: 'x' })).statusCode
    ).toBe(400);
    expect(app.prisma.learningProgress.createMany).not.toHaveBeenCalled();
    expect(app.prisma.learningProgress.updateMany).not.toHaveBeenCalled();
  });

  it('PUT started: a new row is created and answered without a read back', async () => {
    vi.mocked(app.prisma.learningProgress.createMany).mockResolvedValueOnce({ count: 1 });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/learn/progress/lesson-01',
      headers: auth(),
      payload: { status: 'started', step: 81 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item).toMatchObject({ itemId: 'lesson-01', status: 'started', step: 81 });
    expect(app.prisma.learningProgress.updateMany).not.toHaveBeenCalled();
    expect(app.prisma.learningProgress.findUnique).not.toHaveBeenCalled();
  });

  it('should hold each lesson’s first step to the SDK’s, as the client’s lessons test does', () => {
    expect(LESSON_FIRST_STEP).toEqual(LESSON_FIRST_STEPS);
    // And each checkpoint's question set version (the client's checkpoints test holds its own)
    expect(CHECKPOINT_VERSION).toEqual(CHECKPOINT_VERSIONS);
  });

  it('PUT: should refuse a lesson’s start or finish when it is from an earlier version, before any write', async () => {
    // A tab or a cached PWA still on the old Lessons 1–3 can't undo the reset (2026-11-16)
    const put = (url: string, payload: unknown) =>
      app.inject({ method: 'PUT', url, headers: auth(), payload: payload as never });
    for (const id of ['lesson-01', 'lesson-ownership', 'lesson-02']) {
      const url = `/api/learn/progress/${id}`;
      expect((await put(url, { status: 'started', step: 21 })).statusCode, id).toBe(409);
      expect((await put(url, { status: 'started', step: 60 })).statusCode, id).toBe(409);
      expect((await put(url, { status: 'completed' })).statusCode, id).toBe(409);
      expect((await put(url, { status: 'completed', step: 40 })).statusCode, id).toBe(409);
    }
    expect((await put('/api/learn/progress/lesson-01', { status: 'completed' })).json()).toEqual({
      error: 'An earlier version of this lesson',
    });
    expect(app.prisma.learningProgress.createMany).not.toHaveBeenCalled();
    expect(app.prisma.learningProgress.updateMany).not.toHaveBeenCalled();
    expect(app.prisma.learningProgress.upsert).not.toHaveBeenCalled();
  });

  it('PUT completed: should finish a tour when it carries no step', async () => {
    vi.mocked(app.prisma.learningProgress.upsert).mockResolvedValueOnce({
      itemId: 'primer',
      status: 'completed',
      step: null,
      updatedAt: AT,
    } as never);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/learn/progress/primer',
      headers: auth(),
      payload: { status: 'completed' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('PUT completed: should answer a finished lesson without a furthest screen, and store its version', async () => {
    vi.mocked(app.prisma.learningProgress.upsert).mockResolvedValueOnce({
      itemId: 'lesson-02',
      status: 'completed',
      step: null,
      updatedAt: AT,
    } as never);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/learn/progress/lesson-02',
      headers: auth(),
      payload: { status: 'completed', step: 81 },
    });
    expect(res.json().item).toEqual({
      itemId: 'lesson-02',
      status: 'completed',
      updatedAt: AT.toISOString(),
    });
    expect(app.prisma.learningProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { status: 'completed', step: 81 } })
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
    vi.mocked(app.prisma.learningEvent.findFirst).mockResolvedValue(null as never);
    vi.mocked(app.prisma.learningEvent.findMany).mockResolvedValue([] as never);
    vi.mocked(app.prisma.learningEvent.deleteMany).mockResolvedValue({ count: 0 } as never);
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
    expect((await post({ name: 'tour_started', itemId: 'checkpoint-ch1' })).statusCode).toBe(400);
    expect((await post({ name: 'tour_step', itemId: 'primer', stepId: 'x y' })).statusCode).toBe(
      400
    );
    // At most three digits (room for many lesson rebuilds, 2026-11-16)
    expect(
      (await post({ name: 'tour_step', itemId: 'lesson-01', stepId: 'lesson-01.1000' })).statusCode
    ).toBe(400);
    expect(app.prisma.learningEvent.create).not.toHaveBeenCalled();
  });

  it('should accept a three-digit lesson step (a rebuilt lesson’s screens past 99)', async () => {
    const res = await post({ name: 'tour_step', itemId: 'lesson-01', stepId: 'lesson-01.101' });
    expect(res.statusCode).toBe(204);
  });

  it('should refuse a step that belongs to another tour', async () => {
    const res = await post({ name: 'tour_step', itemId: 'primer', stepId: 'buy-first-coin.2' });
    expect(res.statusCode).toBe(400);
    expect(app.prisma.learningEvent.create).not.toHaveBeenCalled();
  });

  it('should prune the oldest rows, not drop the new event, once the user holds the cap', async () => {
    vi.mocked(app.prisma.learningEvent.count).mockResolvedValue(500 as never);
    vi.mocked(app.prisma.learningEvent.findMany).mockResolvedValue([{ id: 'old-1' }] as never);
    const res = await post({ name: 'tour_completed', itemId: 'primer' });

    expect(res.statusCode).toBe(204);
    expect(app.prisma.learningEvent.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { at: 'asc' },
      take: 1,
      select: { id: true },
    });
    expect(app.prisma.learningEvent.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1'] } },
    });
    expect(app.prisma.learningEvent.create).toHaveBeenCalledTimes(1);
  });

  it('should not store a step the account has already recorded for that tour', async () => {
    vi.mocked(app.prisma.learningEvent.findFirst).mockResolvedValue({ id: 'seen' } as never);
    const res = await post({ name: 'tour_step', itemId: 'primer', stepId: 'primer.2' });

    expect(res.statusCode).toBe(204);
    expect(app.prisma.learningEvent.create).not.toHaveBeenCalled();
    expect(app.prisma.learningEvent.count).not.toHaveBeenCalled();
  });

  it('should store a lesson screen like a tour step', async () => {
    const res = await post({ name: 'tour_step', itemId: 'lesson-01', stepId: 'lesson-01.7' });

    expect(res.statusCode).toBe(204);
    expect(app.prisma.learningEvent.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', name: 'tour_step', itemId: 'lesson-01', stepId: 'lesson-01.7' },
    });
    // Only a rating clears earlier ratings
    expect(app.prisma.learningEvent.deleteMany).not.toHaveBeenCalledWith({
      where: expect.objectContaining({ name: 'lesson_rated' }),
    });
  });

  it('should accept the lesson split from Lesson 1, under its own id (2026-11-08)', async () => {
    const res = await post({
      name: 'tour_step',
      itemId: 'lesson-ownership',
      stepId: 'lesson-ownership.3',
    });

    expect(res.statusCode).toBe(204);
    expect(app.prisma.learningEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'tour_step',
        itemId: 'lesson-ownership',
        stepId: 'lesson-ownership.3',
      },
    });
  });

  it('should store a lesson rating of 1 to 5', async () => {
    const res = await post({ name: 'lesson_rated', itemId: 'lesson-01', stepId: 'lesson-01.4' });
    // A new rating replaces the person's earlier ones for that lesson
    expect(app.prisma.learningEvent.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', name: 'lesson_rated', itemId: 'lesson-01' },
    });

    expect(res.statusCode).toBe(204);
    expect(app.prisma.learningEvent.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', name: 'lesson_rated', itemId: 'lesson-01', stepId: 'lesson-01.4' },
    });
  });

  it('should refuse a rating outside 1–5, on a tour, or without a value', async () => {
    for (const stepId of ['lesson-01.0', 'lesson-01.6', 'lesson-01.12']) {
      expect((await post({ name: 'lesson_rated', itemId: 'lesson-01', stepId })).statusCode).toBe(
        400
      );
    }
    expect(
      (await post({ name: 'lesson_rated', itemId: 'primer', stepId: 'primer.3' })).statusCode
    ).toBe(400);
    expect((await post({ name: 'lesson_rated', itemId: 'lesson-01' })).statusCode).toBe(400);
    expect(app.prisma.learningEvent.create).not.toHaveBeenCalled();
  });

  it('should always store a start, a finish and a close, whatever was recorded before', async () => {
    vi.mocked(app.prisma.learningEvent.findFirst).mockResolvedValue({ id: 'seen' } as never);
    for (const name of ['tour_started', 'tour_completed', 'tour_closed']) {
      vi.mocked(app.prisma.learningEvent.create).mockClear();
      await post({ name, itemId: 'primer', stepId: 'primer.1' });
      expect(app.prisma.learningEvent.create).toHaveBeenCalledTimes(1);
    }
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

  it('should count a finish and a rating as learning, not only starts and steps', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/learn/habits',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(app.prisma.learningEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          name: { in: ['tour_started', 'tour_step', 'tour_completed', 'lesson_rated'] },
        },
      })
    );
  });

  it('should take the learner’s time zone, count an unknown one in UTC, and refuse an overlong one', async () => {
    const get = (tz: string) =>
      app.inject({
        method: 'GET',
        url: `/api/learn/habits?tz=${encodeURIComponent(tz)}`,
        headers: { authorization: `Bearer ${token}` },
      });
    expect((await get('Europe/Zurich')).statusCode).toBe(200);
    expect((await get('Etc/GMT+5')).statusCode).toBe(200);
    // An unknown name of the right shape counts in UTC
    expect((await get('Mars/Olympus')).statusCode).toBe(200);
    // Never refused for its text: the streak keeps working, in UTC
    expect((await get('+05:30')).statusCode).toBe(200);
    expect((await get('<script>')).statusCode).toBe(200);
    expect((await get('x'.repeat(65))).statusCode).toBe(400);
  });
});
