import { createHash } from 'node:crypto';
/**
 * /api/auth on a real Postgres (T2i, test plan roadmap P1): refresh-token rotation and logout under
 * concurrent requests, where the unit tests can only mock what `deleteMany` returns.
 */

import { purgeStaleRefreshTokens } from '../../services/RefreshTokens.js';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { cleanDatabase } from './db.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

let app: FastifyInstance;
let db: PrismaClient;
let seq = 0;

type Reply = Awaited<ReturnType<FastifyInstance['inject']>>;
const refreshCookie = (res: Reply) =>
  res.cookies.find((c) => c.name === 'refresh_token' && c.value)?.value;
const refresh = (token: string) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { cookie: `refresh_token=${token}` },
  });

/** A new account through /register (argon2 and all); returns its first refresh token. */
async function register(): Promise<{ userId: string; token: string }> {
  seq += 1;
  const email = `auth-int-${Date.now()}-${seq}@example.test`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email,
      username: `auth_int_${seq}_${Date.now() % 100_000}`,
      password: `Int-${seq}-pass!word`,
      acceptedTerms: true,
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const token = refreshCookie(res);
  expect(token).toBeDefined();
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  return { userId: user.id, token: token! };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  db = app.prisma;
});

afterAll(async () => {
  await cleanDatabase(db);
  await app.close();
});

beforeEach(async () => {
  await cleanDatabase(db);
});

describe('/api/auth/refresh on Postgres — two tabs at once, and a lost reply', () => {
  it('[19.11] rotates once; the second tab (or a retried lost reply) gets a fresh token too, nothing revoked', async () => {
    const { userId, token } = await register();
    const [first, second] = await Promise.all([refresh(token), refresh(token)]);
    // Inside the reuse window both are served (owner 2026-11-13): whichever reply the browser
    // keeps, its cookie works
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    const a = refreshCookie(first);
    const b = refreshCookie(second);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);

    // One rotated row (the old token, kept for the window) and two live ones
    const rows = await db.refreshToken.findMany({ where: { userId } });
    expect(rows.filter((r) => r.rotatedAt !== null)).toHaveLength(1);
    expect(rows.filter((r) => r.rotatedAt === null)).toHaveLength(2);

    // Both new sessions work
    expect((await refresh(a!)).statusCode).toBe(200);
    expect((await refresh(b!)).statusCode).toBe(200);

    // Past the window, the old token is refused: a 401 for that browser, nothing else revoked
    await db.refreshToken.updateMany({
      where: { userId, rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });
    expect((await refresh(token)).statusCode).toBe(401);
    expect(await db.refreshToken.count({ where: { userId, rotatedAt: null } })).toBeGreaterThan(0);
  });

  it('cleans up rotated rows once they are past the window', async () => {
    const { userId, token } = await register();
    const res = await refresh(token);
    expect(res.statusCode).toBe(200);
    await db.refreshToken.updateMany({
      where: { userId, rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });
    expect((await refresh(refreshCookie(res)!)).statusCode).toBe(200);
    // The old rotated row is gone; the just-rotated one stays for its window
    const rotated = await db.refreshToken.findMany({ where: { userId, rotatedAt: { not: null } } });
    expect(rotated).toHaveLength(1);
    expect(Date.now() - rotated[0]!.rotatedAt!.getTime()).toBeLessThan(30_000);
  });
});

describe('/api/auth/logout on Postgres — after a rotation (review on #288)', () => {
  it('ends the session for good: the token rotated just before the logout is refused too', async () => {
    const { userId, token } = await register();
    const rotated = refreshCookie(await refresh(token));
    expect(rotated).toBeDefined();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: `refresh_token=${rotated}` },
    });
    expect(res.statusCode).toBe(204);
    // Inside the reuse window, but logged out: no fresh session from the old token
    expect((await refresh(token)).statusCode).toBe(401);
    expect(await db.refreshToken.count({ where: { userId } })).toBe(0); // the family is gone
  });
});

describe('/api/auth/refresh reuse cap and logout scope on Postgres (review on #288)', () => {
  it('serves a rotated token again at most twice, then refuses it', async () => {
    const { token } = await register();
    expect((await refresh(token)).statusCode).toBe(200); // the rotation
    expect((await refresh(token)).statusCode).toBe(200); // reuse 1: a lost reply
    expect((await refresh(token)).statusCode).toBe(200); // reuse 2: a second tab
    expect((await refresh(token)).statusCode).toBe(401); // the cap
  });

  it('signs out this sign-in only: another device of the same user stays signed in', async () => {
    const { userId, token } = await register();
    // A second device: its own sign-in, so its own family (a token as the server stores it)
    const other = 'f0'.repeat(32);
    await db.refreshToken.create({
      data: {
        tokenHash: createHash('sha256').update(other).digest('hex'),
        userId,
        expiresAt: new Date(Date.now() + 86_400_000),
        familyId: 'other-device',
      },
    });
    const rotated = refreshCookie(await refresh(token));
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: `refresh_token=${rotated}` },
    });
    expect((await refresh(token)).statusCode).toBe(401);
    expect((await refresh(other)).statusCode).toBe(200);
  });
});

describe('purgeStaleRefreshTokens on Postgres', () => {
  it('removes rows rotated past the window and expired ones, and keeps live and just-rotated ones', async () => {
    const { userId, token } = await register();
    const first = refreshCookie(await refresh(token)); // the registration token, rotated now
    expect(first).toBeDefined();
    await db.refreshToken.create({
      data: {
        tokenHash: 'stale-rotated',
        userId,
        expiresAt: new Date(Date.now() + 86_400_000),
        rotatedAt: new Date(Date.now() - 60_000),
      },
    });
    await db.refreshToken.create({
      data: { tokenHash: 'expired', userId, expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await purgeStaleRefreshTokens(db)).toBe(2);
    const left = await db.refreshToken.findMany({ where: { userId } });
    expect(left.map((r) => r.tokenHash).sort()).not.toContain('stale-rotated');
    expect(left).toHaveLength(2); // the live token and the one rotated a moment ago
  });
});

describe('/api/auth/logout on Postgres — twice at once', () => {
  it('[19.12] both succeed (deleteMany, no P2025) and the token is gone', async () => {
    const { userId, token } = await register();
    const logout = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { cookie: `refresh_token=${token}` },
      });
    const results = await Promise.all([logout(), logout()]);
    expect(results.map((r) => r.statusCode)).toEqual([204, 204]);
    expect(await db.refreshToken.count({ where: { userId } })).toBe(0);
    expect((await refresh(token)).statusCode).toBe(401);
  });
});
