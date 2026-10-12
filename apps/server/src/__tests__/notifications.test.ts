import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    const prismaClient = {
      user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    };
    app.decorate('prisma', prismaClient as never);
  };
  Object.defineProperty(plugin, skipOverride, { value: true });
  return { prismaPlugin: plugin };
});

import { buildApp } from '../app.js';
import { makeUnsubscribeToken } from '../lib/unsubscribeToken.js';

describe('/api/notifications', () => {
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
    vi.mocked(app.prisma.user.update).mockResolvedValue({} as never);
    vi.mocked(app.prisma.user.updateMany).mockResolvedValue({ count: 1 } as never);
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it('GET: 401 without a token; off for a user who never opted in', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/notifications' })).statusCode).toBe(401);

    vi.mocked(app.prisma.user.findUnique).mockResolvedValueOnce({ fillEmailOptIn: false } as never);
    const res = await app.inject({ method: 'GET', url: '/api/notifications', headers: auth() });
    expect(res.json()).toEqual({ fillEmail: false });
  });

  it('PUT on: records the consent time for a verified address', async () => {
    vi.mocked(app.prisma.user.findUnique).mockResolvedValueOnce({
      emailVerifiedAt: new Date(),
    } as never);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/notifications',
      headers: auth(),
      payload: { fillEmail: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ fillEmail: true });
    expect(app.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { fillEmailOptIn: true, fillEmailOptInAt: expect.any(Date) },
    });
  });

  it('PUT on: refuses an unverified address and changes nothing', async () => {
    vi.mocked(app.prisma.user.findUnique).mockResolvedValueOnce({ emailVerifiedAt: null } as never);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/notifications',
      headers: auth(),
      payload: { fillEmail: true },
    });

    expect(res.statusCode).toBe(403);
    expect(app.prisma.user.update).not.toHaveBeenCalled();
  });

  it('PUT off: clears the flag and the consent time without a verification check', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/notifications',
      headers: auth(),
      payload: { fillEmail: false },
    });

    expect(res.statusCode).toBe(200);
    expect(app.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(app.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { fillEmailOptIn: false, fillEmailOptInAt: null },
    });
  });

  it('PUT: 401 without a token and 400 for a non-boolean', async () => {
    const put = (headers: Record<string, string>, payload: unknown) =>
      app.inject({ method: 'PUT', url: '/api/notifications', headers, payload: payload as never });
    expect((await put({}, { fillEmail: true })).statusCode).toBe(401);
    expect((await put(auth(), { fillEmail: 'yes' })).statusCode).toBe(400);
    expect((await put(auth(), {})).statusCode).toBe(400);
  });

  it('POST /unsubscribe: a signed link switches the user’s e-mail off, with no sign-in', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifications/unsubscribe',
      payload: { token: makeUnsubscribeToken('user-9') },
    });

    expect(res.statusCode).toBe(200);
    expect(app.prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-9' },
      data: { fillEmailOptIn: false, fillEmailOptInAt: null },
    });
  });

  it('POST /unsubscribe: a forged or malformed token is a 400 and touches nothing', async () => {
    const post = (t: string) =>
      app.inject({ method: 'POST', url: '/api/notifications/unsubscribe', payload: { token: t } });

    expect((await post('user-9.' + 'a'.repeat(64))).statusCode).toBe(400);
    expect((await post('not-a-token-at-all')).statusCode).toBe(400);
    expect((await post('x')).statusCode).toBe(400); // under the minimum length
    expect(app.prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
