/**
 * 🔐 The test hooks (docs/TRADING_TEST_PLAN.md A5) off — the default in every environment: the
 * /api/test routes don't exist, and the email outbox keeps nothing.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    app.decorate('prisma', {} as never);
  };
  // Fastify Symbol-key pattern — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  (plugin as unknown as Record<symbol, boolean>)[skipOverride] = true;
  return { prismaPlugin: plugin };
});

import { buildApp } from '../app.js';
import { config } from '../config.js';
import { outboxFor, recordOutboxEmail } from '../services/emailOutbox.js';

describe('test hooks off (the default)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('is off unless ENABLE_TEST_HOOKS=1', () => {
    expect(config.testHooks).toBe(false);
  });

  it.each([
    ['POST', '/api/test/users'],
    ['GET', '/api/test/outbox?to=a@example.test'],
    ['POST', '/api/test/users/u1/reset'],
  ] as const)('%s %s does not exist (404), even with a secret header', async (method, url) => {
    const res = await app.inject({
      method,
      url,
      headers: { 'x-test-hooks-secret': 'anything-at-all-here' },
      payload: method === 'POST' ? {} : undefined,
    });
    expect(res.statusCode).toBe(404);
  });

  it('keeps no email in the outbox', () => {
    recordOutboxEmail({ kind: 'password-reset', to: 'a@example.test', url: 'http://x/?token=t' });
    expect(outboxFor('a@example.test')).toEqual([]);
  });
});
