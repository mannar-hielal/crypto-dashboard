/**
 * /api/auth on a real Postgres (T2i, test plan roadmap P1): refresh-token rotation and logout under
 * concurrent requests, where the unit tests can only mock what `deleteMany` returns.
 */

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

describe('/api/auth/refresh on Postgres — two tabs at once', () => {
  it('[19.11] rotates the token once: one new session, the other request refused, nothing revoked', async () => {
    const { userId, token } = await register();
    const [first, second] = await Promise.all([refresh(token), refresh(token)]);
    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 401]);
    const winner = first.statusCode === 200 ? first : second;
    const rotated = refreshCookie(winner);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(token);

    // Exactly one live refresh token for the user: the rotated one (stored hashed)
    const rows = await db.refreshToken.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(rotated);

    // The session the winning tab got still works; the old token never does again
    expect((await refresh(rotated!)).statusCode).toBe(200);
    expect((await refresh(token)).statusCode).toBe(401);
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
