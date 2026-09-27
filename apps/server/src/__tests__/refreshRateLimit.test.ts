/**
 * /api/auth/refresh rate limit — the app skips the limiter under NODE_ENV=test, so this drives
 * the route's real config through a real @fastify/rate-limit instance.
 *
 * Regression: every page load probes /refresh. Signed-out probes shared the 20 / 15 min bucket
 * with real token presentations, so one person clicking through the auth flows (or many visitors
 * behind one IP) got a 429 at boot and a signed-in user looked signed out.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { REFRESH_RATE_LIMIT } from '../routes/auth/index.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify();
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(cookie);
  app.post('/refresh', { config: { rateLimit: REFRESH_RATE_LIMIT } }, async (request, reply) =>
    request.cookies.refresh_token ? reply.send({ accessToken: 't' }) : reply.status(204).send()
  );
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const probe = () => app.inject({ method: 'POST', url: '/refresh' });
const present = () =>
  app.inject({ method: 'POST', url: '/refresh', headers: { cookie: 'refresh_token=abc' } });

describe('POST /api/auth/refresh rate limit', () => {
  it('should not let signed-out boot probes use up the budget for a real refresh', async () => {
    for (let i = 0; i < 30; i++) expect((await probe()).statusCode).toBe(204);
    expect((await present()).statusCode).toBe(200);
  });

  it('🔐 should still cap refresh-cookie presentations at 20 per window', async () => {
    for (let i = 0; i < 20; i++) expect((await present()).statusCode).toBe(200);
    expect((await present()).statusCode).toBe(429);
  });

  it('🔐 should still bound no-cookie probes', async () => {
    for (let i = 0; i < 100; i++) expect((await probe()).statusCode).toBe(204);
    expect((await probe()).statusCode).toBe(429);
  });
});
