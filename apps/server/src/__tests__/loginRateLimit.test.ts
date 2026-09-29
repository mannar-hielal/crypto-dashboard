/**
 * /api/auth/login rate limit (NEW-19-1) — the app skips the limiter under NODE_ENV=test (and the e2e
 * server with its test hooks), so this drives the route's real config through a real
 * @fastify/rate-limit instance, as refreshRateLimit.test does.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { LOGIN_RATE_LIMIT } from '../routes/auth/index.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify();
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  app.post('/login', { config: { rateLimit: LOGIN_RATE_LIMIT } }, async (_request, reply) =>
    reply.status(401).send({ error: 'Invalid email or password' })
  );
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const attempt = () => app.inject({ method: 'POST', url: '/login', payload: {} });

describe('POST /api/auth/login rate limit (NEW-19-1)', () => {
  it('🔐 should answer 429 after 10 attempts in the window, with a retry hint', async () => {
    for (let i = 0; i < 10; i++) expect((await attempt()).statusCode).toBe(401);
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});
