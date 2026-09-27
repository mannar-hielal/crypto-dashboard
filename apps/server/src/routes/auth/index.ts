import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { FastifyInstance, FastifyReply } from 'fastify';
import { Prisma } from '../../../generated/prisma/client.js';
import { config } from '../../config.js';
import { EmailService } from '../../services/EmailService.js';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// 🔐 argon2 is now the gold standard (OWASP recommendation) over bcrypt.
//    It is memory-hard and computationally expensive (resistant to GPU cracking).
const REFRESH_TOKEN_COOKIE = 'refresh_token';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// 🔐 Short in-memory grace window: when a token rotation succeeds, remember its
// hash briefly so a near-simultaneous /refresh for the same (already-rotated)
// token — e.g. two browser tabs refreshing at once — is treated as a benign
// race rather than a replayed/stolen token, and doesn't log out every device.
// This is per-process state — correct for a single server instance (current
// deployment), but a loser request handled by a different instance in a
// horizontally-scaled deployment wouldn't see the winner's entry here. Move
// this to Redis (already used elsewhere) before scaling the API past 1 machine.
const ROTATION_GRACE_MS = 5_000;
const recentlyRotatedTokens = new Map<string, number>();

function wasRecentlyRotated(tokenHash: string): boolean {
  const now = Date.now();
  for (const [hash, rotatedAt] of recentlyRotatedTokens) {
    if (now - rotatedAt > ROTATION_GRACE_MS) recentlyRotatedTokens.delete(hash);
  }
  return recentlyRotatedTokens.has(tokenHash);
}

// 🔐 Serializes concurrent /refresh requests for the same token within this
// process. deleteMany is atomic at the DB layer (only one request can ever
// see count=1), but the two requests' promises resolve independently — Node
// gives no guarantee that the winner's continuation (which records the grace
// window above) runs before the loser's continuation checks it. Queuing
// same-token requests removes that ordering dependency entirely: the second
// request's body simply doesn't start until the first has fully finished.
const refreshLocks = new Map<string, Promise<void>>();

async function withRefreshLock<T>(tokenHash: string, fn: () => Promise<T>): Promise<T> {
  const previous = refreshLocks.get(tokenHash) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  refreshLocks.set(tokenHash, held);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (refreshLocks.get(tokenHash) === held) {
      refreshLocks.delete(tokenHash);
    }
  }
}
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
    emailVerifiedAt: { type: ['string', 'null'] },
    termsAcceptedAt: { type: ['string', 'null'] },
    termsAcceptedIp: { type: ['string', 'null'] },
  },
} as const;

const tokenResponse = {
  type: 'object',
  required: ['accessToken', 'user'],
  properties: {
    accessToken: { type: 'string' },
    user: userResponse,
  },
} as const;

const errorResponse = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
  },
} as const;

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
    required: ['email', 'username', 'password', 'acceptedTerms'],
    additionalProperties: false, // 🔐 rejects unknown/extra fields
    properties: {
      email: {
        type: 'string',
        format: 'email', // 🔐 AJV-native email validation
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
        maxLength: 256, // 🔐 argon2 has no effective limit; 256 keeps schema reasonable
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$',
      },
      acceptedTerms: {
        type: 'boolean',
        const: true, // ⚖️ must be true
      },
    },
  },
  response: {
    201: tokenResponse,
    400: errorResponse,
    409: errorResponse,
    429: errorResponse,
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
        format: 'email',
        maxLength: 255,
      },
      password: { type: 'string', minLength: 1, maxLength: 256 },
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
    'Uses the httpOnly refresh token cookie (sameSite: none + secure in prod) to issue a new 15-min access token. Old refresh token is deleted and a new one is set (rotation). With no refresh cookie at all there is no session to restore: 204, no body, nothing issued. A cookie that is present but invalid, expired or replayed gets 401.',
  response: {
    200: {
      type: 'object',
      required: ['accessToken'],
      properties: { accessToken: { type: 'string' } },
    },
    204: { type: 'null', description: 'No refresh cookie — no session to restore' },
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
            emailVerifiedAt: { type: ['string', 'null'] },
            termsAcceptedAt: { type: ['string', 'null'] },
            termsAcceptedIp: { type: ['string', 'null'] },
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
    500: errorResponse,
  },
} as const;

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
        format: 'email',
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
        maxLength: 256,
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

const verifyEmailSchema = {
  tags: ['Auth'],
  summary: 'Verify email address',
  body: {
    type: 'object',
    required: ['token'],
    additionalProperties: false,
    properties: {
      token: { type: 'string', minLength: 64, maxLength: 64 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
    400: errorResponse,
  },
};

const resendVerificationSchema = {
  tags: ['Auth'],
  summary: 'Resend verification email',
  body: {
    type: 'object',
    required: ['email'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
    400: errorResponse,
  },
};

const verifyEmailChangeSchema = {
  tags: ['Auth'],
  summary: 'Verify email change',
  body: {
    type: 'object',
    required: ['token'],
    additionalProperties: false,
    properties: {
      token: { type: 'string', minLength: 64, maxLength: 64 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
    400: errorResponse,
  },
};

const updatePasswordSchema = {
  tags: ['Auth'],
  summary: 'Update password',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['currentPassword', 'newPassword'],
    additionalProperties: false,
    properties: {
      currentPassword: { type: 'string' },
      newPassword: {
        type: 'string',
        minLength: 8,
        maxLength: 256,
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
    400: errorResponse,
    401: errorResponse,
  },
};

const updateUsernameSchema = {
  tags: ['Auth'],
  summary: 'Update username',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['username'],
    additionalProperties: false,
    properties: {
      username: {
        type: 'string',
        minLength: 3,
        maxLength: 20,
        pattern: '^[a-zA-Z0-9_]+$',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
    400: errorResponse,
    401: errorResponse,
    409: errorResponse,
  },
};

const updateEmailSchema = {
  tags: ['Auth'],
  summary: 'Update email',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['email', 'currentPassword'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email', maxLength: 255 },
      currentPassword: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: { user: userResponse },
    },
    400: errorResponse,
    401: errorResponse,
    409: errorResponse,
  },
};

const requestDeletionSchema = {
  tags: ['Auth'],
  summary: 'Request account deletion',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['password'],
    additionalProperties: false,
    properties: {
      password: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
    400: errorResponse,
    401: errorResponse,
  },
};

const cancelDeletionSchema = {
  tags: ['Auth'],
  summary: 'Cancel account deletion',
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
    401: errorResponse,
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
  // In-memory lock: prevents a second concurrent request for the same email from
  // proceeding past the duplicate check. The lock is released when the first
  // request completes (success or failure).
  const registrationLocks = new Set<string>();
  // In-memory email-sent guard: prevents sending the verification email twice
  // for the same email within a 5-minute window. Cleaned up by TTL timeout.
  const emailSentGuard = new Set<string>();
  const EMAIL_SENT_TTL_MS = 5 * 60 * 1000;
  // 🔐 Per-email cooldown for forgot-password — separate from the IP rate limit
  //    so a rotating-IP attacker cannot spam one victim's inbox or kill their
  //    reset link by re-issuing tokens. Also equalizes response timing.
  const resetEmailGuard = new Set<string>();
  const RESET_EMAIL_GUARD_TTL_MS = 60 * 1000;
  const RESET_TIMING_EQUALIZE_MS = 250;

  app.post(
    '/register',
    {
      schema: registerSchema,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const correlationId = randomUUID();
      const { email, username, password, acceptedTerms } = request.body as {
        email: string;
        username: string;
        password: string;
        acceptedTerms: boolean;
      };

      app.log.info({ correlationId }, '📝 Registration attempt');

      // 🔐 Normalize inputs before processing
      const normalizedEmail = email.toLowerCase().trim();
      const normalizedUsername = username.toLowerCase().trim();

      if (!acceptedTerms) {
        return reply.status(400).send({ error: 'Terms and conditions must be accepted' });
      }

      // 🔐 In-memory dedup lock — if a request for this email is already in flight, reject
      if (registrationLocks.has(normalizedEmail)) {
        app.log.warn(
          { correlationId, email: normalizedEmail },
          'Registration dedup lock hit — concurrent request'
        );
        return reply.status(429).send({ error: 'Registration already in progress' });
      }
      registrationLocks.add(normalizedEmail);

      try {
        // 🔐 Check normalized fields to prevent "j.doe@gm.com" vs "J.Doe@gm.com" bypasses
        app.log.info({ correlationId }, '🔍 Checking for existing user');
        const existing = await app.prisma.user.findFirst({
          where: { OR: [{ email: normalizedEmail }, { username: normalizedUsername }] },
        });
        if (existing) {
          app.log.warn(
            { correlationId, email: normalizedEmail, username: normalizedUsername },
            'Registration failed: email or username already taken'
          );
          return reply.status(409).send({ error: 'Email or username already taken' });
        }

        const hashedPassword = await argon2.hash(password);

        // 🔐 Atomic transaction: user + verification token created together.
        // Also deletes any stale tokens first (idempotency guard).
        app.log.info({ correlationId }, '🔄 Starting DB transaction');
        const { user, rawToken } = await app.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: normalizedEmail,
              username: normalizedUsername,
              password: hashedPassword,
              termsAcceptedAt: new Date(),
              termsAcceptedIp: request.ip,
              account: { create: {} },
            },
          });

          // Remove stale tokens so every registration yields exactly one valid token
          await tx.verificationToken.deleteMany({ where: { userId: user.id } });

          const rawToken = generateRefreshToken();
          const tokenHash = hashToken(rawToken);
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

          await tx.verificationToken.create({
            data: { tokenHash, userId: user.id, expiresAt },
          });

          return { user, rawToken };
        });
        app.log.info(
          { correlationId, userId: user.id },
          '✅ Transaction committed — user + token created'
        );

        // 🔐 Email-sent guard: if this email already had a verification email within
        // the TTL window, skip sending. This catches edge cases where the handler
        // executes twice (e.g. platform retry, multi-process timing).
        if (emailSentGuard.has(normalizedEmail)) {
          app.log.warn(
            { correlationId, email: normalizedEmail },
            'Email already sent within TTL — skipping duplicate'
          );
        } else {
          emailSentGuard.add(normalizedEmail);
          const timeoutId = setTimeout(
            () => emailSentGuard.delete(normalizedEmail),
            EMAIL_SENT_TTL_MS
          );

          try {
            const verificationUrl = `${config.clientUrl}/verify-email?token=${rawToken}`;
            app.log.info({ correlationId, to: user.email }, '📧 Sending verification email');
            await EmailService.sendVerificationEmail(user.email, verificationUrl);
            app.log.info({ correlationId }, '✅ Verification email sent');
          } catch (err) {
            emailSentGuard.delete(normalizedEmail);
            clearTimeout(timeoutId);
            throw err;
          }
        }

        const accessToken = await issueTokens(reply, user.id, user.email);

        return reply.status(201).send({
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            emailVerifiedAt: null,
            termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
            termsAcceptedIp: user.termsAcceptedIp,
          },
        });
      } catch (err) {
        // Handle race conditions where two requests for the same user pass the findFirst check
        // but the second one fails at the DB unique constraint level.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          app.log.warn(
            { correlationId, email: normalizedEmail, username: normalizedUsername },
            'Registration failed: Race condition unique constraint'
          );
          return reply.status(409).send({ error: 'Email or username already taken' });
        }
        app.log.error({ correlationId, err }, '❌ Registration error');
        throw err;
      } finally {
        registrationLocks.delete(normalizedEmail);
      }
    }
  );

  // ─── VERIFY EMAIL ───────────────────────────────────────────────────────────
  app.post('/verify-email', { schema: verifyEmailSchema }, async (request, reply) => {
    const { token } = request.body as { token: string };
    const tokenHash = hashToken(token);

    app.log.info('Verifying email with token hash');

    const stored = await app.prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      app.log.warn('Verification failed: token not found in database');
      return reply.status(400).send({ error: 'Invalid or expired verification token' });
    }

    if (stored.expiresAt < new Date()) {
      app.log.warn({ expiresAt: stored.expiresAt }, 'Verification failed: token expired');
      return reply.status(400).send({ error: 'Invalid or expired verification token' });
    }

    app.log.info({ userId: stored.userId }, 'Token valid, updating user');

    // 🔐 Consume the token FIRST with deleteMany: a concurrent duplicate request (double click,
    //    two tabs, a StrictMode double effect) gets count=0 and a 400, not a P2025 500.
    try {
      await app.prisma.$transaction(async (tx) => {
        const { count } = await tx.verificationToken.deleteMany({ where: { id: stored.id } });
        if (count === 0) throw new TokenConsumedError();
        await tx.user.update({
          where: { id: stored.userId },
          data: { emailVerifiedAt: new Date() },
        });
      });
    } catch (err) {
      if (err instanceof TokenConsumedError) {
        return reply.status(400).send({ error: 'Invalid or expired verification token' });
      }
      throw err;
    }

    return reply.send({ message: 'Email verified successfully. You can now use all features.' });
  });

  // ─── RESEND VERIFICATION ────────────────────────────────────────────────────
  app.post(
    '/resend-verification',
    {
      schema: resendVerificationSchema,
    },
    async (request, reply) => {
      const { email } = request.body as { email: string };
      const normalizedEmail = email.toLowerCase().trim();

      const user = await app.prisma.user.findUnique({ where: { email: normalizedEmail } });

      // 🔐 Standard response even if email not found/already verified (anti-enumeration)
      const SUCCESS_MSG = { message: 'If unverified, a new link has been sent.' };

      if (!user || user.emailVerifiedAt) {
        return reply.send(SUCCESS_MSG);
      }

      // 🔐 Email-sent guard: skip resend if an email was already sent within the TTL
      if (emailSentGuard.has(normalizedEmail)) {
        app.log.warn({ email: normalizedEmail }, 'Resend skipped — email already sent within TTL');
        return reply.send(SUCCESS_MSG);
      }
      emailSentGuard.add(normalizedEmail);
      const timeoutId = setTimeout(() => emailSentGuard.delete(normalizedEmail), EMAIL_SENT_TTL_MS);

      try {
        // Cleanup old tokens
        await app.prisma.verificationToken.deleteMany({ where: { userId: user.id } });

        const rawToken = generateRefreshToken();
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await app.prisma.verificationToken.create({
          data: { tokenHash, userId: user.id, expiresAt },
        });

        const verificationUrl = `${config.clientUrl}/verify-email?token=${rawToken}`;
        await EmailService.sendVerificationEmail(user.email, verificationUrl);

        return reply.send(SUCCESS_MSG);
      } catch (err) {
        emailSentGuard.delete(normalizedEmail);
        clearTimeout(timeoutId);
        throw err;
      }
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
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as {
        email: string;
        password: string;
      };

      const normalizedEmail = email.toLowerCase().trim();
      const user = await app.prisma.user.findUnique({ where: { email: normalizedEmail } });

      // 🔐 Always run a verify-like check even if user not found — prevents timing attacks.
      //    Argon2 verification against a dummy hash ensures CPU time is consistent.
      const DUMMY_HASH =
        '$argon2id$v=19$m=65536,t=3,p=4$vO91vGis5E7A0wB8V9bsww$8C8LCHn7X3O5z/j2tU6F+g';
      const passwordMatch = user
        ? await argon2.verify(user.password, password)
        : await argon2.verify(DUMMY_HASH, password).then(() => false);

      if (!user || !passwordMatch) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      const accessToken = await issueTokens(reply, user.id, user.email);

      return reply.send({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
          termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
          termsAcceptedIp: user.termsAcceptedIp,
        },
      });
    }
  );

  // ─── REFRESH ─────────────────────────────────────────────────────────────────
  app.post(
    '/refresh',
    { schema: refreshSchema, config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      // cookie name is a known constant — safe, controlled access
      // eslint-disable-next-line security/detect-object-injection
      const rawToken = request.cookies[REFRESH_TOKEN_COOKIE];

      // The client probes this on every app boot. No cookie means a signed-out visitor, which
      // is a normal answer, not a failed authentication: 204 and nothing issued. 🔐 A cookie
      // that is present but rejected below still gets 401 (and replay detection still runs).
      if (!rawToken) {
        return reply.status(204).send();
      }

      const tokenHash = hashToken(rawToken);

      return withRefreshLock(tokenHash, async () => {
        const stored = await app.prisma.refreshToken.findUnique({ where: { tokenHash } });

        // 🔐 Token not found or expired — clear cookie to avoid stale state
        if (!stored || stored.expiresAt < new Date()) {
          void reply.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_BASE_OPTIONS);
          return reply.status(401).send({ error: 'Invalid or expired refresh token' });
        }

        // 🔐 Token rotation: use deleteMany (P2025-safe) so concurrent /refresh requests
        //    each get an atomic delete. Only the first succeeds (count=1); the second
        //    gets count=0 and is treated as an invalid token — no 500 race condition.
        const { count: deleted } = await app.prisma.refreshToken.deleteMany({
          where: { tokenHash },
        });
        if (deleted === 0) {
          // 🔐 Token already consumed = either a benign double-tab race OR a replayed
          //    stolen token. Only escalate to a full session revoke when this token
          //    wasn't just rotated by a concurrent request of our own — that's the
          //    classic session-theft signal. A same-token race within the grace
          //    window is expected (e.g. two tabs refreshing at once) and shouldn't
          //    log out every device.
          if (wasRecentlyRotated(tokenHash)) {
            return reply.status(401).send({ error: 'Invalid or expired refresh token' });
          }
          app.log.warn(
            { userId: stored.userId },
            'Refresh token replay detected — revoking all sessions'
          );
          await app.prisma.refreshToken.deleteMany({ where: { userId: stored.userId } });
          void reply.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_BASE_OPTIONS);
          return reply.status(401).send({ error: 'Invalid or expired refresh token' });
        }
        recentlyRotatedTokens.set(tokenHash, Date.now());

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
    }
  );

  // ─── LOGOUT ──────────────────────────────────────────────────────────────────
  app.post('/logout', { schema: logoutSchema }, async (request, reply) => {
    // cookie name is a known constant — safe, controlled access
    // eslint-disable-next-line security/detect-object-injection
    const rawToken = request.cookies[REFRESH_TOKEN_COOKIE];

    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      // 🔐 deleteMany is idempotent — no P2025 if already expired/deleted
      await app.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }

    void reply.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_BASE_OPTIONS);
    return reply.status(204).send();
  });

  // ─── FORGOT PASSWORD ────────────────────────────────────────────���────────────
  app.post(
    '/forgot-password',
    {
      schema: forgotPasswordSchema,
      config: {
        rateLimit: {
          max: config.nodeEnv === 'development' ? 20 : 3,
          timeWindow: config.nodeEnv === 'development' ? '1 minute' : '15 minutes',
        },
      }, // 🔐 strict rate limit in prod — prevents email enumeration via timing
    },
    async (request, reply) => {
      const { email } = request.body as { email: string };

      // 🔐 Always return 200 — never reveal whether the email exists
      const SAFE_RESPONSE = { message: 'If that email exists, a reset link has been sent.' };

      const normalizedEmail = email.toLowerCase().trim();
      app.log.info({ normalizedEmail }, 'Forgot password requested');

      // 🔐 Per-email cooldown — stops an attacker rotating IPs from flooding a
      //    victim's inbox and continuously invalidating their reset link.
      if (resetEmailGuard.has(normalizedEmail)) {
        return reply.send(SAFE_RESPONSE);
      }
      resetEmailGuard.add(normalizedEmail);
      setTimeout(() => {
        resetEmailGuard.delete(normalizedEmail);
      }, RESET_EMAIL_GUARD_TTL_MS);

      const user = await app.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        // 🔐 Equalize response time with the existing-user path so the endpoint
        //    cannot enumerate registered emails via timing. Perform the same
        //    token-hash cost plus a bounded delay in place of the email send.
        const throwaway = generateRefreshToken();
        hashToken(throwaway);
        await new Promise((r) => setTimeout(r, RESET_TIMING_EQUALIZE_MS));
        app.log.info({ normalizedEmail }, 'Forgot password: user not found (uniform response)');
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

    const hashedPassword = await argon2.hash(password);

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
          data: {
            password: hashedPassword,
            emailVerifiedAt: new Date(),
          },
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

  // ─── ME (protected) ────────────────────────────────────────────────────────
  app.get('/me', { schema: meSchema, onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const userId = (request.user as { userId: string }).userId;

      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        // 🔐 Never load the password hash into memory — omit it from the query
        omit: { password: true },
        include: {
          account: true,
        },
      });

      if (!user) {
        return reply.status(401).send({ error: 'User not found' });
      }

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
          termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
          termsAcceptedIp: user.termsAcceptedIp,
          account: user.account
            ? {
                ...user.account,
                totalBalance: user.account.totalBalance.toString(),
                availableBalance: user.account.availableBalance.toString(),
                unrealizedPnl: user.account.unrealizedPnl.toString(),
                realizedPnl: user.account.realizedPnl.toString(),
                createdAt: user.account.createdAt.toISOString(),
                updatedAt: user.account.updatedAt.toISOString(),
              }
            : null,
        },
      });
    } catch (err) {
      app.log.error({ err }, 'Failed to fetch me');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  // ─── UPDATE PASSWORD (protected) ─────────────────────────────────────────────
  app.patch(
    '/password',
    { schema: updatePasswordSchema, onRequest: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { currentPassword, newPassword } = request.body as {
        currentPassword?: string;
        newPassword?: string;
      };

      if (!currentPassword || !newPassword) {
        return reply.status(400).send({ error: 'Missing current or new password' });
      }

      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.status(401).send({ error: 'User no longer exists' });

      const match = await argon2.verify(user.password, currentPassword);
      if (!match) return reply.status(401).send({ error: 'Invalid current password' });

      const hashed = await argon2.hash(newPassword);
      await app.prisma.user.update({
        where: { id: userId },
        data: { password: hashed },
      });

      // 🔐 Standards: Invalidate all other sessions (including the current one if not careful)
      // Here we logout after password change for maximum security.
      await app.prisma.refreshToken.deleteMany({ where: { userId } });
      void reply.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_BASE_OPTIONS);

      return reply.send({ message: 'Password updated. Please log in again.' });
    }
  );

  // ─── UPDATE USERNAME (protected) ─────────────────────────────────────────────
  app.patch(
    '/username',
    { schema: updateUsernameSchema, onRequest: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { username } = request.body as { username?: string };

      if (!username) {
        return reply.status(400).send({ error: 'Username is required' });
      }

      const normalizedUsername = username.toLowerCase().trim();

      const existing = await app.prisma.user.findFirst({
        where: { username: normalizedUsername, NOT: { id: userId } },
      });

      if (existing) {
        return reply.status(409).send({ error: 'Username already taken' });
      }

      const user = await app.prisma.user.update({
        where: { id: userId },
        data: { username: normalizedUsername },
        omit: { password: true },
      });

      return reply.send({ user });
    }
  );

  // ─── UPDATE EMAIL (protected) ───────────────────────────────────────────────
  app.patch(
    '/email',
    { schema: updateEmailSchema, onRequest: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { email, currentPassword } = request.body as {
        email?: string;
        currentPassword?: string;
      };

      if (!email || !currentPassword) {
        return reply.status(400).send({ error: 'Email and current password are required' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return reply.status(401).send({ error: 'User no longer exists' });
      }

      const passwordMatch = await argon2.verify(user.password, currentPassword);
      if (!passwordMatch) {
        return reply.status(401).send({ error: 'Invalid current password' });
      }

      const existing = await app.prisma.user.findFirst({
        where: { email: normalizedEmail, NOT: { id: userId } },
      });

      if (existing) {
        return reply.status(409).send({ error: 'Email already taken' });
      }

      // 🔐 Don't update immediately. Issue verification token for the NEW email.
      const rawToken = generateRefreshToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await app.prisma.emailChangeToken.create({
        data: { tokenHash, userId, newEmail: normalizedEmail, expiresAt },
      });

      const verificationUrl = `${config.clientUrl}/verify-email-change?token=${rawToken}`;
      await EmailService.sendEmailChangeVerification(normalizedEmail, verificationUrl);

      return reply.send({ message: 'Verification link sent to your new email address.' });
    }
  );

  // ─── VERIFY EMAIL CHANGE ─────────────────────────────────────────────────────
  app.post('/verify-email-change', { schema: verifyEmailChangeSchema }, async (request, reply) => {
    const { token } = request.body as { token: string };
    const tokenHash = hashToken(token);

    const stored = await app.prisma.emailChangeToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Invalid or expired token' });
    }

    const oldEmail = stored.user.email;
    const newEmail = stored.newEmail;

    // 🔐 Consume the token FIRST with deleteMany: a concurrent duplicate request gets count=0
    //    and a 400 (and no second security-alert email), not a P2025 500.
    try {
      await app.prisma.$transaction(async (tx) => {
        const { count } = await tx.emailChangeToken.deleteMany({ where: { id: stored.id } });
        if (count === 0) throw new TokenConsumedError();
        await tx.user.update({
          where: { id: stored.userId },
          data: { email: newEmail, emailVerifiedAt: new Date() },
        });
        // 🔐 Standards: Security logout after email change
        await tx.refreshToken.deleteMany({ where: { userId: stored.userId } });
      });
    } catch (err) {
      if (err instanceof TokenConsumedError) {
        return reply.status(400).send({ error: 'Invalid or expired token' });
      }
      throw err;
    }

    await EmailService.sendEmailChangedSecurityAlert(oldEmail, oldEmail, newEmail);
    void reply.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_BASE_OPTIONS);

    return reply.send({ message: 'Email updated successfully. Please log in again.' });
  });

  // ─── DELETE ACCOUNT (protected) ──────────────────────────────────────────────
  app.delete(
    '/account',
    {
      schema: requestDeletionSchema,
      onRequest: [app.authenticate],
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { password } = request.body as { password?: string };

      if (!password) {
        return reply.status(400).send({ error: 'Password is required' });
      }

      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return reply.status(401).send({ error: 'User no longer exists' });
      }

      const passwordMatch = await argon2.verify(user.password, password);
      if (!passwordMatch) {
        return reply.status(401).send({ error: 'Invalid password' });
      }

      const deletionRequestedAt = new Date();
      const deletionDate = new Date(deletionRequestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

      // 🧪 TEST MODE: Immediate deletion in development + Test Policy Email
      if (process.env.NODE_ENV === 'development') {
        // Send the scheduled deletion email first so the user can test/verify it
        await EmailService.sendDeletionRequestedEmail(user.email, user.username, deletionDate);

        await app.prisma.user.delete({ where: { id: userId } });
        await app.prisma.refreshToken.deleteMany({ where: { userId } });
        void reply.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_BASE_OPTIONS);
        return reply.send({ message: 'Account deleted immediately & test email sent (dev mode).' });
      }

      await app.prisma.user.update({
        where: { id: userId },
        data: { deletionRequestedAt },
      });

      await EmailService.sendDeletionRequestedEmail(user.email, user.username, deletionDate);

      // 🔐 Force logout after deletion request
      await app.prisma.refreshToken.deleteMany({ where: { userId } });
      void reply.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_BASE_OPTIONS);

      return reply.send({ message: 'Account scheduled for deletion in 30 days.' });
    }
  );

  // ─── CANCEL DELETION (protected) ─────────────────────────────────────────────
  app.post(
    '/cancel-deletion',
    { schema: cancelDeletionSchema, onRequest: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return reply.status(401).send({ error: 'User no longer exists' });
      }

      await app.prisma.user.update({
        where: { id: userId },
        data: { deletionRequestedAt: null, deletionWarningSentAt: null },
      });

      await EmailService.sendDeletionCancelledEmail(user.email, user.username);

      return reply.send({ message: 'Account deletion request cancelled successfully.' });
    }
  );
}
