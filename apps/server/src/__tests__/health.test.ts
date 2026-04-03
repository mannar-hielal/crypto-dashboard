import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Why mock prismaPlugin?
 * buildApp() registers prismaPlugin which calls prisma.$connect() — a real DB call.
 * In tests we don't want a DB dependency for a simple health check.
 * vi.mock() is auto-hoisted by Vitest above all imports, so the mock is in place
 * before buildApp() ever tries to import the real prismaPlugin.
 */
vi.mock('../plugins/prisma.js', () => ({
  prismaPlugin: async (app: FastifyInstance) => {
    app.decorate('prisma', {} as never);
  },
}));

import { buildApp } from '../app.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
  });

  it('returns status ok, correct environment, and a timestamp', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = response.json<{
      status: string;
      timestamp: string;
      environment: string;
    }>();

    expect(body.status).toBe('ok');
    expect(body.environment).toBe('test');
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // valid ISO date
  });
});
