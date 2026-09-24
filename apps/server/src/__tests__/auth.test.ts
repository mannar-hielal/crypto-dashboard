import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import * as argon2 from 'argon2';

// ─── Mock EmailService ────────────────────────────────────────────────────────
// Prevent real Resend API calls during tests — RESEND_API_KEY is set in .env
// so without this mock the SDK fires a real HTTP request and may throw.
vi.mock('../services/EmailService.js', () => ({
  EmailService: {
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendEmailChangeVerification: vi.fn().mockResolvedValue(undefined),
    sendEmailChangedSecurityAlert: vi.fn().mockResolvedValue(undefined),
    sendDeletionRequestedEmail: vi.fn().mockResolvedValue(undefined),
    sendDeletionCancelledEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

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
    const prismaClient = {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      verificationToken: {
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn(),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      refreshToken: {
        // Default: always succeeds — individual tests can override with mockResolvedValueOnce
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        findUnique: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      emailChangeToken: {
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn(),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      // Supports both transaction forms used in production code:
      //   Array form:       $transaction([op1, op2])          → runs ops concurrently via Promise.all
      //   Interactive form: $transaction(async (tx) => { … }) → calls the callback with this mock client
      $transaction: vi
        .fn()
        .mockImplementation(
          async (arg: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) =>
            typeof arg === 'function' ? arg(prismaClient) : Promise.all(arg)
        ),
    };
    app.decorate('prisma', prismaClient as never);
  };
  // Fastify Symbol-key pattern — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  (plugin as unknown as Record<symbol, boolean>)[skipOverride] = true;
  return { prismaPlugin: plugin };
});

import { buildApp } from '../app.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const validUser = {
  email: 'test@example.com',
  username: 'testuser',
  password: 'Password1!',
  acceptedTerms: true,
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
    const createSpy = vi.spyOn(app.prisma.user, 'create').mockResolvedValueOnce({
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

    // ⚖️ Verify Legal Compliance audit trail
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: validUser.email,
          username: validUser.username,
          termsAcceptedAt: expect.any(Date),
          termsAcceptedIp: '127.0.0.1',
          account: { create: {} }, // 💰 Verify paper trading account initialization
        }),
      })
    );
  });

  it('returns 400 when terms are not accepted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ...validUser, acceptedTerms: false },
    });

    // Fastify schema validation (const: true) will reject this
    expect(res.statusCode).toBe(400);
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
    const hashed = await argon2.hash(validUser.password);

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
    const hashed = await argon2.hash('DifferentPass1!');

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

  it('normalizes the email address (lowercases and trims)', async () => {
    const hashed = await argon2.hash(validUser.password);
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      password: hashed,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'TEST@Example.com', password: validUser.password },
    });

    expect(res.statusCode).toBe(200);
    expect(app.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    });
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
      account: {
        id: 'acc-1',
        totalBalance: { toString: () => '10000' },
        availableBalance: { toString: () => '10000' },
        unrealizedPnl: { toString: () => '0' },
        realizedPnl: { toString: () => '0' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
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

// ─── REFRESH ─────────────────────────────────────────────────────────────────
describe('POST /api/auth/refresh', () => {
  let app: FastifyInstance;
  // 64 hex chars = 32 bytes, same format as a real refresh token
  const RAW_TOKEN = 'a'.repeat(64);
  const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const PAST = new Date(Date.now() - 1000);

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with a new access token when the refresh token is valid', async () => {
    (app.prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'rt-1',
      tokenHash: 'hashed',
      userId: 'user-1',
      expiresAt: FUTURE,
    });
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
    expect(typeof res.json<{ accessToken: string }>().accessToken).toBe('string');
  });

  it('returns 401 when no refresh token cookie is present', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the token is not found in the DB (stolen/invalid)', async () => {
    (app.prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the token is expired', async () => {
    (app.prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'rt-1',
      tokenHash: 'hashed',
      userId: 'user-1',
      expiresAt: PAST, // 🔐 expired
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the user no longer exists after token lookup', async () => {
    (app.prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'rt-1',
      tokenHash: 'hashed',
      userId: 'deleted-user',
      expiresAt: FUTURE,
    });
    // Token found but user was deleted
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 on already-consumed refresh token with no recent rotation and revokes ALL user sessions (🔐 replay protection)', async () => {
    const deleteManyMock = app.prisma.refreshToken.deleteMany as ReturnType<typeof vi.fn>;
    deleteManyMock.mockClear();
    deleteManyMock.mockResolvedValue({ count: 0 });

    // A token never successfully rotated in this test file — distinguishes a
    // genuinely replayed/stolen token from a benign concurrent-tab race (see
    // the test below), which must NOT trigger a global revoke.
    const STOLEN_RAW_TOKEN = 'c'.repeat(64);

    (app.prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'rt-stolen',
      tokenHash: 'hashed-stolen',
      userId: 'user-1',
      expiresAt: FUTURE,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${STOLEN_RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(401);
    // 🔐 Stolen-token replay = account takeover in progress — the user-wide
    //    deleteMany({ userId }) must run (2 calls total: token-hash + user-wide).
    expect(deleteManyMock).toHaveBeenCalledTimes(2);
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('returns 401 without revoking other sessions when the token was just rotated by a concurrent request (benign double-tab race)', async () => {
    const deleteManyMock = app.prisma.refreshToken.deleteMany as ReturnType<typeof vi.fn>;
    deleteManyMock.mockClear();

    const RACE_RAW_TOKEN = 'd'.repeat(64);

    // First request: rotation succeeds (count: 1) — marks the token as
    // "recently rotated" in the in-memory grace window.
    deleteManyMock.mockResolvedValueOnce({ count: 1 });
    (app.prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'rt-race',
      tokenHash: 'hashed-race',
      userId: 'user-1',
      expiresAt: FUTURE,
    });
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${RACE_RAW_TOKEN}` },
    });
    expect(first.statusCode).toBe(200);

    // Second, near-simultaneous request for the same (already-rotated) token
    // — e.g. a second browser tab. The delete finds nothing (count: 0).
    deleteManyMock.mockResolvedValueOnce({ count: 0 });
    (app.prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'rt-race',
      tokenHash: 'hashed-race',
      userId: 'user-1',
      expiresAt: FUTURE,
    });

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${RACE_RAW_TOKEN}` },
    });

    expect(second.statusCode).toBe(401);
    // 🔐 Only the token-hash delete ran for the second request — no user-wide
    //    revoke, so the other (winning) tab stays logged in.
    expect(deleteManyMock).toHaveBeenCalledTimes(2);
    expect(deleteManyMock).not.toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('serializes two truly concurrent requests for the same token instead of letting them race (🔐 no mass revoke regardless of DB response ordering)', async () => {
    const deleteManyMock = app.prisma.refreshToken.deleteMany as ReturnType<typeof vi.fn>;
    const findUniqueMock = app.prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>;
    deleteManyMock.mockClear();
    findUniqueMock.mockClear();

    const CONCURRENT_RAW_TOKEN = 'f'.repeat(64);
    const stored = {
      id: 'rt-concurrent',
      tokenHash: 'hashed-concurrent',
      userId: 'user-1',
      expiresAt: FUTURE,
    };
    findUniqueMock.mockResolvedValue(stored);
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      email: validUser.email,
    });

    // First request's deleteMany is deliberately held open (simulates a slow
    // DB round trip) so we can assert the second request doesn't even start
    // its own DB work until the first fully finishes and releases the lock —
    // that's the mechanism that removes the race, independent of whichever
    // request's DB response happens to arrive back first in a real deployment.
    let resolveFirstDelete!: (v: { count: number }) => void;
    const firstDeleteGate = new Promise<{ count: number }>((resolve) => {
      resolveFirstDelete = resolve;
    });
    deleteManyMock.mockImplementationOnce(() => firstDeleteGate);
    deleteManyMock.mockResolvedValueOnce({ count: 0 });

    const requestA = app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${CONCURRENT_RAW_TOKEN}` },
    });
    const requestB = app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${CONCURRENT_RAW_TOKEN}` },
    });

    // Give both requests a chance to start. B must still be blocked on the
    // lock — it should not have reached findUnique yet.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(findUniqueMock).toHaveBeenCalledTimes(1);

    // Now let the first (winning) request finish.
    resolveFirstDelete({ count: 1 });

    const [resA, resB] = await Promise.all([requestA, requestB]);

    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(401);
    expect(deleteManyMock).not.toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });
});

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  let app: FastifyInstance;
  const RAW_TOKEN = 'b'.repeat(64);

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 204 and clears the cookie when a valid token cookie is present', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: `refresh_token=${RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(204);
    // 🔐 Verify cookie is cleared (Max-Age=0 means browser deletes it)
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it('returns 204 even when no cookie is present (idempotent logout)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(204);
  });
});

// ─── RESEND VERIFICATION ────────────────────────────────────────────────────
describe('POST /api/auth/resend-verification', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 even for unverified users', async () => {
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: 'unverified@example.com',
      emailVerifiedAt: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/resend-verification',
      payload: { email: 'unverified@example.com' },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ─── EMAIL VERIFICATION ─────────────────────────────────────────────────────
describe('POST /api/auth/verify-email', () => {
  let app: FastifyInstance;
  const VALID_TOKEN = 'd'.repeat(64);

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 when a verification token is valid', async () => {
    (app.prisma.verificationToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'vt-1',
      tokenHash: 'hashed',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      user: { id: 'user-1', email: 'verify@example.com' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token: VALID_TOKEN },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ message: string }>().message).toMatch(/verified successfully/i);
  });

  it('returns 400 for an invalid or expired verification token', async () => {
    (app.prisma.verificationToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token: VALID_TOKEN },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/verify-email-change', () => {
  let app: FastifyInstance;
  const VALID_TOKEN = 'e'.repeat(64);

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 when the email change token is valid', async () => {
    (app.prisma.emailChangeToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'ect-1',
      tokenHash: 'hashed',
      userId: 'user-1',
      newEmail: 'new-email@example.com',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      user: { id: 'user-1', email: 'old-email@example.com', username: 'testuser' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email-change',
      payload: { token: VALID_TOKEN },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ message: string }>().message).toMatch(/email updated successfully/i);
  });

  it('returns 400 for an invalid email change token', async () => {
    (app.prisma.emailChangeToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email-change',
      payload: { token: VALID_TOKEN },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── PROFILE & SECURITY SETTINGS ─────────────────────────────────────────────
describe('Protected auth lifecycle routes', () => {
  let app: FastifyInstance;
  const authHeaders = {
    authorization: `Bearer token-placeholder`,
  };

  beforeAll(async () => {
    app = await buildApp();
    authHeaders.authorization = `Bearer ${app.jwt.sign({ userId: 'user-1', email: validUser.email })}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('updates the username', async () => {
    (app.prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (app.prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
      username: 'new_name',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/username',
      headers: authHeaders,
      payload: { username: 'new_name' },
    });

    expect(res.statusCode).toBe(200);
    expect(app.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { username: 'new_name' },
      })
    );
  });

  it('updates the email and sends a verification link', async () => {
    const hashed = await argon2.hash(validUser.password);
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
      password: hashed,
    });
    (app.prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/email',
      headers: authHeaders,
      payload: { email: 'new@example.com', currentPassword: validUser.password },
    });

    expect(res.statusCode).toBe(200);
    expect(app.prisma.emailChangeToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          newEmail: 'new@example.com',
        }),
      })
    );
  });

  it('updates the password and clears sessions', async () => {
    const hashed = await argon2.hash(validUser.password);
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
      password: hashed,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/password',
      headers: authHeaders,
      payload: {
        currentPassword: validUser.password,
        newPassword: 'NewPass1!@#',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ message: string }>().message).toMatch(/log in again/i);
  });

  it('schedules account deletion in non-development environments', async () => {
    const hashed = await argon2.hash(validUser.password);
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
      username: validUser.username,
      password: hashed,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/auth/account',
      headers: authHeaders,
      payload: { password: validUser.password },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ message: string }>().message).toMatch(/scheduled for deletion/i);
  });

  it('cancels a pending deletion request', async () => {
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
      username: validUser.username,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/cancel-deletion',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ message: string }>().message).toMatch(/cancelled successfully/i);
  });
});

// ─── FORGOT PASSWORD ─────────────────────────────────────────────────────────
describe('POST /api/auth/forgot-password', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with a safe message when the email exists', async () => {
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: validUser.email,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: validUser.email },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ message: string }>().message).toMatch(/reset link/i);
  });

  it('returns 401 on wrong password', async () => {
    const hashed = await argon2.hash('DifferentPass1!');

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

  it('normalizes the email address (lowercases and trims)', async () => {
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'USER@Example.COM' },
    });

    expect(res.statusCode).toBe(200);
    expect(app.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
  });

  it('returns 400 for an invalid email format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'not-an-email' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
describe('POST /api/auth/reset-password', () => {
  let app: FastifyInstance;
  const VALID_TOKEN = 'c'.repeat(64); // 64 hex chars = valid token format
  const STRONG_PASSWORD = 'NewPass1!@#';
  const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
  const PAST = new Date(Date.now() - 1000);

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 and updates the password when the token is valid', async () => {
    (app.prisma.passwordResetToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'prt-1',
      tokenHash: 'hashed',
      userId: 'user-1',
      expiresAt: FUTURE,
      usedAt: null, // not yet used
    });
    // Interactive $transaction calls back with the mock client;
    // passwordResetToken.updateMany returns { count: 1 } and user.update returns {} by default.

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: VALID_TOKEN, password: STRONG_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ message: string }>().message).toMatch(/password updated/i);
  });

  it('returns 400 when the token is not found in the DB', async () => {
    (app.prisma.passwordResetToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: VALID_TOKEN, password: STRONG_PASSWORD },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/invalid or expired/i);
  });

  it('returns 400 when the token is expired', async () => {
    (app.prisma.passwordResetToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'prt-1',
      tokenHash: 'hashed',
      userId: 'user-1',
      expiresAt: PAST, // 🔐 expired
      usedAt: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: VALID_TOKEN, password: STRONG_PASSWORD },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/invalid or expired/i);
  });

  it('returns 400 when the token has already been used (🔐 one-time use enforcement)', async () => {
    (app.prisma.passwordResetToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'prt-1',
      tokenHash: 'hashed',
      userId: 'user-1',
      expiresAt: FUTURE,
      usedAt: new Date(), // 🔐 already consumed
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: VALID_TOKEN, password: STRONG_PASSWORD },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/invalid or expired/i);
  });

  it('returns 400 when the new password is too weak', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: VALID_TOKEN, password: 'weakpassword' },
    });

    expect(res.statusCode).toBe(400);
  });
});
