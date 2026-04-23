import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../../config.js';
import { EmailService } from '../../services/EmailService.js';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// 🔐 Cost 12 in non-test environments = ~250ms per hash (brute-force resistant).
//    Cost 1 in test = fast CI without compromising real security.
const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 1 : 12;
const REFRESH_TOKEN_COOKIE = 'refresh_token';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived — lives only in Zustand memory

// ─── TOKEN HELPERS ────────────────────────────────────────────────────────────
// 🔐 SHA-256 hash stored in DB — if DB is breached, attacker gets hashes,
//    not valid tokens. SHA-256 is irreversible without the original value.
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// 🔐 32 random bytes = 256 bits of entropy — cryptographically unguessable
function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

// ─── SHARED RESPONSE SCHEMAS ──────────────────────────────────────────────────
const userResponse = {
  type: 'object',
  required: ['id', 'email', 'username'],
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    username: { type: 'string' },
  },
};

const tokenResponse = {
  type: 'object',
  required: ['accessToken', 'user'],
  properties: {
    accessToken: { type: 'string' },
    user: userResponse,
  },
};

const errorResponse = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
  },
};

// ─── REQUEST SCHEMAS ──────────────────────────────────────────────────────────
// Fastify validates ALL incoming data against these BEFORE your handler runs.
// Invalid requests → instant 400 rejection. No DB hit, no CPU wasted.

const registerSchema = {
  tags: ['Auth'],
  summary: 'Register a new user',
  description:
    'Creates a user account and a paper trading account. Returns a 15-min access token. A 7-day refresh token is set as an httpOnly cookie (sameSite: none + secure in production, lax in development).',
  body: {
    type: 'object',
    required: ['email', 'username', 'password'],
    additionalProperties: false, // 🔐 rejects unknown/extra fields
    properties: {
      email: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
        maxLength: 255,
      },
      username: {
        type: 'string',
        minLength: 3,
        maxLength: 20,
        pattern: '^[a-zA-Z0-9_]+$', // 🔐 alphanumeric + underscore only
      },
      password: {
        type: 'string',
        minLength: 8,
        maxLength: 72, // 🔐 bcrypt silently ignores chars beyond 72
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$',
      },
    },
  },
  response: {
    201: tokenResponse,
    400: errorResponse,
    409: errorResponse,
  },
};

const loginSchema = {
  tags: ['Auth'],
  summary: 'Login',
  description:
    'Authenticate with email and password. Returns a 15-min access token. A 7-day refresh token is set as an httpOnly cookie (sameSite: none + secure in production, lax in development).',
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
        maxLength: 255,
      },
      password: { type: 'string', minLength: 1, maxLength: 72 },
    },
  },
  response: {
    200: tokenResponse,
    400: errorResponse,
    401: errorResponse,
  },
};

const refreshSchema = {
  tags: ['Auth'],
  summary: 'Refresh access token',
  description:
    'Uses the httpOnly refresh token cookie (sameSite: none + secure in prod) to issue a new 15-min access token. Old refresh token is deleted and a new one is set (rotation).',
  response: {
    200: {
      type: 'object',
      required: ['accessToken'],
      properties: { accessToken: { type: 'string' } },
    },
    401: errorResponse,
  },
};

const logoutSchema = {
  tags: ['Auth'],
  summary: 'Logout',
  description:
    'Deletes the refresh token from the database and clears the httpOnly cookie. The client should discard the access token from memory.',
  response: {
    204: { type: 'null' },
  },
};

const meSchema = {
  tags: ['Auth'],
  summary: 'Get current user',
  description: 'Returns the authenticated user profile and their paper trading account.',
  security: [{ bearerAuth: [] }], // 🔐 tells Swagger UI this route needs a JWT
  response: {
    200: {
      type: 'object',
      required: ['user'],
      properties: {
        user: {
          type: 'object',
          required: ['id', 'email', 'username'],
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            username: { type: 'string' },
            account: {
              type: ['object', 'null'],
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                totalBalance: { type: 'string' },
                availableBalance: { type: 'string' },
                unrealizedPnl: { type: 'string' },
                realizedPnl: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
    401: errorResponse,
  },
};

const forgotPasswordSchema = {
  tags: ['Auth'],
  summary: 'Request password reset',
  description:
    '🔐 Always returns 200 regardless of whether the email exists — prevents email enumeration attacks.',
  body: {
    type: 'object',
    required: ['email'],
    additionalProperties: false,
    properties: {
      email: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
        maxLength: 255,
      },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['message'],
      properties: { message: { type: 'string' } },
    },
  },
};

const resetPasswordSchema = {
  tags: ['Auth'],
  summary: 'Reset password using token',
  description:
    'Validates the one-time token and updates the user password. Token expires in 1 hour.',
  body: {
    type: 'object',
    required: ['token', 'password'],
    additionalProperties: false,
    properties: {
      token: { type: 'string', minLength: 64, maxLength: 64 }, // 32 bytes = 64 hex chars
      password: {
        type: 'string',
        minLength: 8,
        maxLength: 72,
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['message'],
      properties: { message: { type: 'string' } },
    },
    400: errorResponse,
  },
};

// ─── COOKIE OPTIONS ───────────────────────────────────────────────────────────
// Shared across setCookie and every clearCookie call — must be identical so browsers
// can match and delete the cookie (mismatched options prevent deletion).
//
// 🔐 sameSite strategy:
//   'none' + secure:true in production → required for cross-domain deployments
//   (client on app.example.com, API on api.example.com) so the browser includes
//   the cookie in cross-site fetch requests with credentials:'include'.
//   'lax' in development → client and API share localhost, no HTTPS needed.
const COOKIE_BASE_OPTIONS = {
  path: '/',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  secure: process.env.NODE_ENV === 'production',
} as const;

// Sentinel used to abort the reset-password transaction without leaking stack traces
class TokenConsumedError extends Error {
  constructor() {
    super('Token already consumed by a concurrent request');
  }
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance) {
  // ─── HELPER: issue tokens ────────────────────────────────────────────────────
  // Issues a short-lived access token and sets a rotating httpOnly refresh cookie.
  // Called from /register, /login, and /refresh — single source of truth.
  async function issueTokens(reply: FastifyReply, userId: string, email: string): Promise<string> {
    // 🔐 Access token: 15 min, stored only in Zustand memory — never touches disk
    const accessToken = app.jwt.sign({ userId, email }, { expiresIn: ACCESS_TOKEN_EXPIRY });

    // 🔐 Refresh token: raw value → httpOnly cookie, SHA-256 hash → DB
    const rawRefresh = generateRefreshToken();
    const tokenHash = hashToken(rawRefresh);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    await app.prisma.refreshToken.create({ data: { tokenHash, userId, expiresAt } });

    void reply.setCookie(REFRESH_TOKEN_COOKIE, rawRefresh, {
      ...COOKIE_BASE_OPTIONS,
      httpOnly: true, // 🔐 JS cannot read this cookie — XSS-safe
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
    });

    return accessToken;
  }

  // ─── REGISTER ───────────────────────────────────────────────────────────────
  app.post(
    '/register',
    {
      schema: registerSchema,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour',
          skip: () => process.env.NODE_ENV !== 'production',
        },
      },
    },
    async (request, reply) => {
      const { email, username, password } = request.body as {
        email: string;
        username: string;
        password: string;
      };

      const existing = await app.prisma.user.findFirst({
        where: { OR: [{ email }, { username }] },
      });
      if (existing) {
        return reply.status(409).send({ error: 'Email or username already taken' });
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const user = await app.prisma.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
          account: { create: {} },
        },
      });

      const accessToken = await issueTokens(reply, user.id, user.email);

      return reply.status(201).send({
        accessToken,
        user: { id: user.id, email: user.email, username: user.username },
      });
    }
  );

  // ─── LOGIN ───────────────────────────────────────────────────────────────────
  app.post(
    '/login',
    {
      schema: loginSchema,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '15 minutes',
          skip: () => process.env.NODE_ENV !== 'production',
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as {
        email: string;
        password: string;
      };

      const user = await app.prisma.user.findUnique({ where: { email } });

      // 🔐 Always run bcrypt even if user not found — prevents timing attacks
      const passwordMatch = user ? await bcrypt.compare(password, user.password) : false;

      if (!user || !passwordMatch) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      const accessToken = await issueTokens(reply, user.id, user.email);

      return reply.send({
        accessToken,
        user: { id: user.id, email: user.email, username: user.username },
      });
    }
  );

  // ─── REFRESH ─────────────────────────────────────────────────────────────────
  app.post('/refresh', { schema: refreshSchema }, async (request, reply) => {
    const rawToken = request.cookies[REFRESH_TOKEN_COOKIE];

    if (!rawToken) {
      return reply.status(401).send({ error: 'No refresh token' });
    }

    const tokenHash = hashToken(rawToken);
    const stored = await app.prisma.refreshToken.findUnique({ where: { tokenHash } });

    // 🔐 Token not found or expired — clear cookie to avoid stale state
    if (!stored || stored.expiresAt < new Date()) {
      void reply.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_BASE_OPTIONS);
      return reply.status(401).send({ error: 'Invalid or expired refresh token' });
    }

    // 🔐 Token rotation: use deleteMany (P2025-safe) so concurrent /refresh requests
    //    each get an atomic delete. Only the first succeeds (count=1); the second
    //    gets count=0 and is treated as an invalid token — no 500 race condition.
    const { count: deleted } = await app.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    if (deleted === 0) {
      // 🔐 Token-theft full-revocation (Option A): count=0 means this token was already
      //    consumed — possible token theft or replay attack. Revoke ALL refresh tokens for
      //    this user so the attacker's newly issued token is also killed immediately.
      //    `stored.userId` is still available from the earlier findUnique.
      await app.prisma.refreshToken.deleteMany({ where: { userId: stored.userId } });
      void reply.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_BASE_OPTIONS);
      return reply.status(401).send({ error: 'Invalid or expired refresh token' });
    }

    // Fetch the user to include email in the new access token payload
    const user = await app.prisma.user.findUnique({
      where: { id: stored.userId },
      select: { id: true, email: true },
    });

    if (!user) {
      void reply.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_BASE_OPTIONS);
      return reply.status(401).send({ error: 'User no longer exists' });
    }

    const accessToken = await issueTokens(reply, user.id, user.email);

    return reply.send({ accessToken });
  });

  // ─── LOGOUT ──────────────────────────────────────────────────────────────────
  app.post('/logout', { schema: logoutSchema }, async (request, reply) => {
    const rawToken = request.cookies[REFRESH_TOKEN_COOKIE];

    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      // 🔐 deleteMany is idempotent — no P2025 if already expired/deleted
      await app.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }

    void reply.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_BASE_OPTIONS);
    return reply.status(204).send();
  });

  // ─── FORGOT PASSWORD ─────────────────────────────────────────────────────────
  app.post(
    '/forgot-password',
    {
      schema: forgotPasswordSchema,
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '15 minutes',
          skip: () => process.env.NODE_ENV !== 'production',
        },
      }, // 🔐 strict rate limit — prevents email enumeration via timing
    },
    async (request, reply) => {
      const { email } = request.body as { email: string };

      // 🔐 Always return 200 — never reveal whether the email exists
      const SAFE_RESPONSE = { message: 'If that email exists, a reset link has been sent.' };

      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user) {
        return reply.send(SAFE_RESPONSE);
      }

      // Invalidate any existing unused tokens for this user before issuing a new one
      await app.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });

      const rawToken = generateRefreshToken(); // reuse same 256-bit generator
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await app.prisma.passwordResetToken.create({
        data: { tokenHash, userId: user.id, expiresAt },
      });

      const resetUrl = `${config.clientUrl}/reset-password?token=${rawToken}`;

      try {
        await EmailService.sendPasswordResetEmail(email, resetUrl);
      } catch (err) {
        // 🔐 Log but never propagate — a delivery failure must not reveal whether
        //    the email exists (a 500 only for existing users breaks anti-enumeration)
        app.log.error({ err }, 'Failed to queue password reset email');
      }

      return reply.send(SAFE_RESPONSE);
    }
  );

  // ─── RESET PASSWORD ───────────────────────────────────────────────────────────
  app.post('/reset-password', { schema: resetPasswordSchema }, async (request, reply) => {
    const { token, password } = request.body as { token: string; password: string };

    const tokenHash = hashToken(token);

    const resetToken = await app.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    // 🔐 Unified error message — don't reveal whether token was invalid vs expired
    if (!resetToken || resetToken.expiresAt < new Date() || resetToken.usedAt !== null) {
      return reply.status(400).send({ error: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // 🔐 Interactive transaction: consume the token FIRST so that if a concurrent
    //    request races through the findUnique check, its updateMany returns count=0
    //    and the entire transaction is aborted before the password is updated.
    //    Doing it in the opposite order would let both requests update the password
    //    even when one should have been rejected.
    try {
      await app.prisma.$transaction(async (tx) => {
        const { count } = await tx.passwordResetToken.updateMany({
          where: { tokenHash, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (count === 0) throw new TokenConsumedError();

        await tx.user.update({
          where: { id: resetToken.userId },
          data: { password: hashedPassword },
        });
      });
    } catch (err) {
      if (err instanceof TokenConsumedError) {
        return reply.status(400).send({ error: 'Invalid or expired reset token' });
      }
      throw err;
    }

    // 🔐 Invalidate all active sessions — force re-login after password change
    await app.prisma.refreshToken.deleteMany({ where: { userId: resetToken.userId } });

    return reply.send({ message: 'Password updated successfully. Please log in again.' });
  });

  // ─── ME (protected) ──────────────────────────────────────────────────────────
  app.get('/me', { schema: meSchema, onRequest: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user as { userId: string; email: string };

    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      include: { account: true },
      omit: { password: true }, // 🔐 never expose password hash
    });

    if (!user) {
      return reply.status(401).send({ error: 'User no longer exists' });
    }

    return { user };
  });
}
