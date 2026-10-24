/**
 * /api/market/candles rate limit (review on #262): the app skips the limiter under NODE_ENV=test,
 * so this drives the route's real config through a real @fastify/rate-limit instance, as
 * loginRateLimit.test does. Reaching back with `end` gets its own, stricter bucket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { CANDLES_RATE_LIMIT } from '../routes/market/index.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify();
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  app.get('/candles', { config: { rateLimit: CANDLES_RATE_LIMIT } }, async (_request, reply) =>
    reply.send({ candles: [] })
  );
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: 'GET', url });

describe('GET /api/market/candles rate limit', () => {
  it('🔐 should allow 20 history requests (with end) a minute, then answer 429', async () => {
    for (let i = 0; i < 20; i++)
      expect((await get(`/candles?end=${1621468800000 + i}`)).statusCode).toBe(200);
    expect((await get('/candles?end=1621468800000')).statusCode).toBe(429);
  });

  it('should keep live requests in their own bucket of 100', async () => {
    for (let i = 0; i < 20; i++) await get(`/candles?end=${1621468800000 + i}`);
    // The history bucket is spent; the live chart still loads
    for (let i = 0; i < 100; i++) expect((await get('/candles?interval=1m')).statusCode).toBe(200);
    expect((await get('/candles?interval=1m')).statusCode).toBe(429);
  });
});
