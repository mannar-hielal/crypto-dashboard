import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
// We don't want a real DB in unit tests. vi.mock() is auto-hoisted by Vitest
// so it runs before any import, replacing the real plugin with a fake.
//
// ⚠️  Why Symbol.for('skip-override')?
// The real prismaPlugin is wrapped with fastify-plugin (fp), which sets this
// symbol to tell Fastify: "don't create a child scope — apply to root".
// Without it, app.decorate('prisma', ...) only lives in a child scope and
// route handlers (registered in their own scope) can't see app.prisma.
vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    app.decorate('prisma', {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      refreshToken: {
        // Default: always succeeds — individual tests can override with mockResolvedValueOnce
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn(),
        delete: vi.fn().mockResolvedValue({}),
      },
    } as never);
  };
  (plugin as unknown as Record<symbol, boolean>)[skipOverride] = true;
  return { prismaPlugin: plugin };
});

import { buildApp } from '../app.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const validUser = {
  email: 'test@example.com',
  username: 'testuser',
  password: 'Password1!',
};

// ─── REGISTER ────────────────────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with token and user on valid registration', async () => {
    // No existing user found → proceed to create
    (app.prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (app.prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
      username: validUser.username,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: validUser,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ accessToken: string; user: { email: string } }>();
    expect(typeof body.accessToken).toBe('string');
    expect(body.user.email).toBe(validUser.email);
  });

  it('returns 409 when email or username is already taken', async () => {
    (app.prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'existing-user',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: validUser,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toMatch(/already taken/i);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'test@example.com' }, // missing username and password
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when password is too weak', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ...validUser, password: 'weakpassword' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('strips extra unknown fields and still registers successfully', async () => {
    // 🔐 Fastify's AJV runs with removeAdditional:true by default — extra fields
    // are silently stripped before the handler runs, so the attacker's injected
    // `role` field never reaches the DB. The request is NOT rejected (no 400).
    (app.prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (app.prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
      username: validUser.username,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ...validUser, role: 'admin' },
    });

    expect(res.statusCode).toBe(201);
    // Verify the extra field is NOT reflected back in the response
    const body = res.json<Record<string, unknown>>();
    expect(body).not.toHaveProperty('role');
  });
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with token on valid credentials', async () => {
    const bcrypt = await import('bcrypt');
    const hashed = await bcrypt.hash(validUser.password, 1); // cost 1 = fast in tests

    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
      username: validUser.username,
      password: hashed,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: validUser.email, password: validUser.password },
    });

    expect(res.statusCode).toBe(200);
    expect(typeof res.json<{ accessToken: string }>().accessToken).toBe('string');
  });

  it('returns 401 on wrong password', async () => {
    const bcrypt = await import('bcrypt');
    const hashed = await bcrypt.hash('DifferentPass1!', 1);

    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
      password: hashed,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: validUser.email, password: validUser.password },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when user does not exist', async () => {
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ghost@example.com', password: 'Password1!' },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── ME ──────────────────────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns user when JWT is valid', async () => {
    const token = app.jwt.sign({ userId: 'user-1', email: validUser.email });

    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
      username: validUser.username,
      account: { id: 'acc-1', balance: '10000' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ user: { email: string } }>().user.email).toBe(validUser.email);
  });

  it('returns 401 with no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with a fake/tampered token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer this.is.fake' },
    });
    expect(res.statusCode).toBe(401);
  });
});
