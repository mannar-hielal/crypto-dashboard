/**
 * The test hooks (docs/TRADING_TEST_PLAN.md A5) on a real Postgres: seeded users go through the real
 * /register and /verify-email, the outbox carries the links, and every call needs the secret.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Before config.ts loads (each test file gets its own module graph)
const SECRET = vi.hoisted(() => {
  const secret = 'i'.repeat(32); // throwaway: the hooks need 16+ characters
  process.env.ENABLE_TEST_HOOKS = '1';
  process.env.TEST_HOOKS_SECRET = secret;
  return secret;
});

import { buildApp } from '../../app.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { cleanDatabase } from './db.js';

let app: FastifyInstance;
let db: PrismaClient;
const headers = { 'x-test-hooks-secret': SECRET };

interface Seeded {
  userId: string;
  email: string;
  username: string;
  password: string;
  verified: boolean;
}

async function seed(payload: Record<string, unknown> = {}): Promise<Seeded> {
  const res = await app.inject({ method: 'POST', url: '/api/test/users', headers, payload });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<Seeded>();
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  db = app.prisma;
  await cleanDatabase(db);
});

afterAll(async () => {
  await cleanDatabase(db);
  await app.close();
});

describe('test hooks on Postgres', () => {
  it.each([
    ['no secret', {}],
    ['a wrong secret', { 'x-test-hooks-secret': `${SECRET}x` }],
  ])('🔐 refuses a call with %s (401)', async (_label, h) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test/users',
      headers: h,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    expect(await db.user.count()).toBe(0);
  });

  it('creates a verified user who can sign in with the returned password', async () => {
    const user = await seed();
    expect(user.email).toMatch(/^e2e-.+@test\.local$/);
    expect(user.verified).toBe(true);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.userId } });
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(row.termsAcceptedAt).not.toBeNull();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(login.statusCode).toBe(200);
  });

  it('leaves a user unverified on request, with the verification link in the outbox', async () => {
    const user = await seed({ email: 'Seeded.Unverified@test.local', verified: false });
    const row = await db.user.findUniqueOrThrow({ where: { id: user.userId } });
    expect(row.emailVerifiedAt).toBeNull();
    const res = await app.inject({
      method: 'GET',
      url: '/api/test/outbox?to=seeded.unverified@test.local',
      headers,
    });
    expect(res.statusCode).toBe(200);
    const { emails } = res.json<{ emails: { kind: string; url?: string }[] }>();
    expect(emails.map((e) => e.kind)).toEqual(['verify-email']);
    expect(emails[0]?.url).toMatch(/\/verify-email\?token=[0-9a-f]+$/);
  });

  it('applies the margin mode and per-symbol leverage asked for', async () => {
    const user = await seed({
      marginMode: 'ISOLATED_MARGIN',
      leverage: { BTCUSDT: 5, ETHUSDT: 3 },
    });
    const account = await db.account.findUniqueOrThrow({ where: { userId: user.userId } });
    expect(account.marginMode).toBe('ISOLATED_MARGIN');
    const settings = await db.symbolSetting.findMany({
      where: { accountId: account.id },
      orderBy: { symbol: 'asc' },
    });
    expect(settings.map((s) => [s.symbol, s.leverage])).toEqual([
      ['BTCUSDT', 5],
      ['ETHUSDT', 3],
    ]);
  });

  it('refuses a leverage outside 1–10 (400); drops an unknown symbol, as every route does', async () => {
    const tooHigh = await app.inject({
      method: 'POST',
      url: '/api/test/users',
      headers,
      payload: { leverage: { BTCUSDT: 11 } },
    });
    expect(tooHigh.statusCode).toBe(400);
    // Fastify's Ajv strips properties a schema doesn't declare (removeAdditional)
    const user = await seed({ leverage: { DOGEUSDC: 2 } });
    const account = await db.account.findUniqueOrThrow({ where: { userId: user.userId } });
    expect(await db.symbolSetting.count({ where: { accountId: account.id } })).toBe(0);
  });

  it('records a pending deletion and signs the user out, as production does', async () => {
    const user = await seed();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(login.statusCode).toBe(200);
    const res = await app.inject({
      method: 'POST',
      url: `/api/test/users/${user.userId}/request-deletion`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.userId } });
    expect(row.deletionRequestedAt).not.toBeNull();
    expect(await db.refreshToken.count({ where: { userId: user.userId } })).toBe(0);
  });

  it('resets a user’s account without a session', async () => {
    const user = await seed({ leverage: { BTCUSDT: 5 } });
    const before = await db.account.findUniqueOrThrow({ where: { userId: user.userId } });
    const res = await app.inject({
      method: 'POST',
      url: `/api/test/users/${user.userId}/reset`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const after = await db.account.findUniqueOrThrow({ where: { userId: user.userId } });
    expect(after.resetCount).toBe(before.resetCount + 1);
    expect(after.availableBalance.toString()).toBe('10000');
  });
});
