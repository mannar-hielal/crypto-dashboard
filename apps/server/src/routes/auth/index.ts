import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';

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
  required: ['token', 'user'],
  properties: {
    token: { type: 'string' },
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

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// 🔐 Cost 12 in non-test environments = ~250ms per hash (brute-force resistant).
// Cost 1 in test = fast CI without compromising real security.
const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 1 : 12;

// ─── REQUEST SCHEMAS ──────────────────────────────────────────────────────────
// Fastify validates ALL incoming data against these BEFORE your handler runs.
// Invalid requests → instant 400 rejection. No DB hit, no CPU wasted.

const registerSchema = {
  tags: ['Auth'],
  summary: 'Register a new user',
  description: 'Creates a user account and a paper trading account. Returns a JWT token.',
  body: {
    type: 'object',
    required: ['email', 'username', 'password'],
    additionalProperties: false, // 🔐 rejects unknown/extra fields
    properties: {
      email: {
        type: 'string',
        // regex instead of "format: email" to avoid needing ajv-formats package
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
        // 🔐 must have: lowercase + uppercase + number + special char
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$',
      },
    },
  },
  response: {
    201: tokenResponse,
    400: errorResponse, // Fastify body validation failure
    409: errorResponse,
  },
};

const loginSchema = {
  tags: ['Auth'],
  summary: 'Login',
  description: 'Authenticate with email and password. Returns a JWT token.',
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
    400: errorResponse, // Fastify body validation failure
    401: errorResponse,
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
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                balance: { type: 'string' },
              },
            },
          },
        },
      },
    },
    401: errorResponse,
  },
};

// ─── ROUTES ───────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance) {
  // ─── REGISTER ───────────────────────────────────────────────────────────────
  app.post(
    '/register',
    {
      schema: registerSchema,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour',
          skip: () => process.env.NODE_ENV !== 'production', // skip in dev/test
        },
      }, // 🔐 max 5 registrations/hour per IP (production only)
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

      const token = app.jwt.sign({ userId: user.id, email: user.email }, { expiresIn: '7d' });

      return reply.status(201).send({
        token,
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
          skip: () => process.env.NODE_ENV !== 'production', // skip in dev/test
        },
      }, // 🔐 max 10 attempts/15min per IP (production only)
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

      const token = app.jwt.sign({ userId: user.id, email: user.email }, { expiresIn: '7d' });

      return {
        token,
        user: { id: user.id, email: user.email, username: user.username },
      };
    }
  );

  // ─── ME (protected) ──────────────────────────────────────────────────────────
  app.get('/me', { schema: meSchema, onRequest: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user as { userId: string; email: string };

    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      include: { account: true },
      omit: { password: true }, // 🔐 never expose password hash
    });

    // 🔐 User was deleted after token was issued — treat as unauthorized
    if (!user) {
      return reply.status(401).send({ error: 'User no longer exists' });
    }

    return { user };
  });
}
