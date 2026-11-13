import { createHash } from 'node:crypto';
/**
 * /api/auth on a real Postgres (T2i, test plan roadmap P1): refresh-token rotation and logout under
 * concurrent requests, where the unit tests can only mock what `deleteMany` returns.
 */

import { purgeStaleRefreshTokens, REFRESH_REUSE_CAP } from '../../services/RefreshTokens.js';
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

    // Past the window, the old token coming back reads as stolen: 401, and that sign-in's family
    // (both new sessions came from it) is ended (review on #288)
    await db.refreshToken.updateMany({
      where: { userId, rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });
    expect((await refresh(token)).statusCode).toBe(401);
    expect((await refresh(a!)).statusCode).toBe(401);
    expect((await refresh(b!)).statusCode).toBe(401);
  });

  it('keeps a rotated token until it expires, so a replay after later refreshes is still caught (review on #288)', async () => {
    const { userId, token } = await register();
    const t2 = refreshCookie(await refresh(token));
    // The legitimate user goes on refreshing, past the window
    await db.refreshToken.updateMany({
      where: { userId, rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });
    const t3 = refreshCookie(await refresh(t2!));
    expect(t3).toBeDefined();
    // The first token's row is still there…
    expect(await db.refreshToken.count({ where: { userId, rotatedAt: { not: null } } })).toBe(2);
    // …so a thief replaying it now trips the theft signal: the sign-in is ended, t3 included
    expect((await refresh(token)).statusCode).toBe(401);
    expect((await refresh(t3!)).statusCode).toBe(401);
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
  it('serves a rotated token again up to the cap (the client’s retries and a tab), then refuses it', async () => {
    const { token } = await register();
    expect((await refresh(token)).statusCode).toBe(200); // the rotation
    // A flaky link: every one of the client's reconnect retries of a lost reply is served
    let last = await refresh(token);
    expect(last.statusCode).toBe(200);
    for (let reuse = 2; reuse <= REFRESH_REUSE_CAP; reuse++) {
      last = await refresh(token);
      expect(last.statusCode, `reuse ${reuse}`).toBe(200);
    }
    const capped = await refresh(token);
    expect(capped.statusCode).toBe(401); // the cap
    // …without clearing the cookie: the session the last reuse set still works
    expect(capped.headers['set-cookie']).toBeUndefined();
    expect((await refresh(refreshCookie(last)!)).statusCode).toBe(200);
  });

  it('ends a pre-family token’s session for good after the backfill (review on #288)', async () => {
    // A token issued before families, as the migration left it: its own id is its family
    const { userId } = await register();
    const legacy = 'e1'.repeat(32);
    const row = await db.refreshToken.create({
      data: {
        tokenHash: createHash('sha256').update(legacy).digest('hex'),
        userId,
        expiresAt: new Date(Date.now() + 86_400_000),
        familyId: 'placeholder',
      },
    });
    await db.refreshToken.update({ where: { id: row.id }, data: { familyId: row.id } });
    const rotated = refreshCookie(await refresh(legacy));
    expect(rotated).toBeDefined();
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: `refresh_token=${rotated}` },
    });
    // The rotation kept the family, so the logout removed the old row too
    expect((await refresh(legacy)).statusCode).toBe(401);
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
  it('removes expired rows, rotated or not; rotated rows stay until they expire, for the theft signal', async () => {
    const { userId, token } = await register();
    const first = refreshCookie(await refresh(token)); // the registration token, rotated now
    expect(first).toBeDefined();
    await db.refreshToken.create({
      data: {
        tokenHash: 'stale-rotated',
        userId,
        familyId: 'stale',
        expiresAt: new Date(Date.now() + 86_400_000),
        rotatedAt: new Date(Date.now() - 60_000),
      },
    });
    await db.refreshToken.create({
      data: {
        tokenHash: 'expired',
        userId,
        familyId: 'expired',
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await db.refreshToken.create({
      data: {
        tokenHash: 'rotated-and-expired',
        userId,
        familyId: 'old',
        expiresAt: new Date(Date.now() - 1000),
        rotatedAt: new Date(Date.now() - 2000),
      },
    });
    // Expired rows go, rotated or not; rotated rows stay until they expire (the theft signal)
    expect(await purgeStaleRefreshTokens(db)).toBe(2);
    const left = await db.refreshToken.findMany({ where: { userId } });
    expect(left.map((r) => r.tokenHash)).toContain('stale-rotated');
    expect(left.map((r) => r.tokenHash)).not.toContain('expired');
    expect(left.map((r) => r.tokenHash)).not.toContain('rotated-and-expired');
    expect(left).toHaveLength(3); // the live token, the one rotated a moment ago, the older rotated one
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
