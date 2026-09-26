import websocket from '@fastify/websocket';
import bybitPlugin from './plugins/bybit.js';
import { marketRoutes } from './routes/market/index.js';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import ajvFormats from 'ajv-formats';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config.js';
import { prismaPlugin } from './plugins/prisma.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth/index.js';
import { paperRoutes } from './routes/paper/index.js';
import { newsletterRoutes } from './routes/newsletter/index.js';

const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  // 'unsafe-inline' on style-src is required by Framer Motion animated styles —
  // style injection is not a script-execution vector, so this is an accepted
  // tradeoff (documented in the client's index.html CSP).
  styleSrc: ["'self'", "'unsafe-inline'"],
  connectSrc: ["'self'", config.corsOrigin],
  imgSrc: ["'self'", 'data:', 'blob:'],
  fontSrc: ["'self'", 'data:'],
  workerSrc: ["'self'", 'blob:'],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'self'"],
  reportUri: '/api/csp-violation',
};

export async function buildApp() {
  const app = Fastify({
    // Disable Fastify's logger in tests to reduce terminal noise
    logger: config.nodeEnv === 'test' ? false : { level: config.logLevel },
    ajv: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fastify's AJV plugin typing is incompatible with ajv-formats in this install.
      plugins: [ajvFormats as any],
    },
  });

  // ─── CSP VIOLATION REPORTING ──────────────────────────────────────────────
  // Browsers POST violation reports on first load + on each violation.
  // Accept both legacy (application/csp-report) and modern (application/reports+json) formats.
  // The route itself is registered AFTER rate-limit below so it inherits the
  // global limiter (it is a public, unauthenticated log sink).
  app.addContentTypeParser(
    ['application/csp-report', 'application/reports+json'],
    { parseAs: 'string' },
    (_req, body: string, done: (err: Error | null, body: unknown) => void) => {
      try {
        done(null, JSON.parse(body));
      } catch {
        done(null, {});
      }
    }
  );

  // ─── API DOCUMENTATION ────────────────────────────────────────────────────
  // Swagger reads your route schemas and auto-generates an OpenAPI 3.0 spec.
  // Must be registered BEFORE routes so it can pick them up.
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'cryptopapertrade.com API',
        description: 'Paper trading platform — Phase 1 API',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          // Tells Swagger UI to send "Authorization: Bearer <token>" on protected routes
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'Health', description: 'Server health & readiness' },
        { name: 'Auth', description: 'Register, login and profile' },
        { name: 'Market', description: 'Real-time market data and historical candles' },
        { name: 'Newsletter', description: 'Pre-launch waitlist subscription' },
      ],
    },
  });

  // 🔐 Only expose /docs in non-production — never leak your API schema publicly
  if (config.nodeEnv !== 'production') {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }

  // ─── SECURITY PLUGINS ─────────────────────────────────────────────────────
  await app.register(helmet, {
    // 🔐 Disable CSP in non-production only — swagger-ui loads inline scripts
    // that our custom CSP would block. In production CSP is fully on.
    contentSecurityPolicy:
      config.nodeEnv === 'production'
        ? {
            directives: CSP_DIRECTIVES,
            reportOnly: false,
          }
        : false,
    strictTransportSecurity: {
      maxAge: 63072000, // 2 years — industry standard
      includeSubDomains: true,
      preload: true, // eligible for browser preload lists
    },
  });
  // Skip rate limiting in test — prevents flaky tests caused by per-IP counters
  if (config.nodeEnv !== 'test') {
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });
  }

  // ─── CUSTOM ERROR HANDLER ─────────────────────────────────────────────────
  // 🔐 Must be set BEFORE any route is registered: Fastify fixes each route's error handler when
  //    the route is defined, so routes registered earlier silently kept Fastify's default
  //    handler — which returns err.message on a 500 (found in BP-1: a thrown internal error's
  //    text reached the client).
  // 🔐 Normalises ALL error responses to { error: string } so:
  //    1. The documented schema (errorResponse) matches what the API actually returns.
  //    2. Fastify's verbose validation payload ({ statusCode, code, error, message })
  //       is never leaked to the client — hides internal implementation details.
  //    3. 5xx errors are logged server-side while only a safe message goes out.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      app.log.error(
        { err: error, method: request.method, url: request.url },
        'Unhandled server error'
      );
      // 🔐 Never leak internal details (DB errors, stack traces) to the client
      // In development, we return the message to help debugging.
      void reply.status(statusCode).send({
        error: 'Internal Server Error',
        ...(config.nodeEnv === 'development' && { message: error.message }),
      });
      return;
    }

    void reply.status(statusCode).send({ error: error.message ?? 'Bad Request' });
  });

  // 🔐 Registered AFTER rate-limit so this public log sink is protected from abuse
  app.post('/api/csp-violation', async (request, reply) => {
    app.log.warn({ cspReport: request.body }, 'CSP violation reported');
    return reply.status(204).send();
  });
  await app.register(cors, {
    // 🔐 Explicit origin allowlist in ALL environments — `origin: true` (reflect
    //    any) with `credentials: true` is a credential-exfiltration hazard if
    //    NODE_ENV is ever mis-set in a deployed environment.
    origin: [config.corsOrigin],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // WebSocket support — must be registered before any websocket routes
  await app.register(websocket);

  // ─── CORE PLUGINS ─────────────────────────────────────────────────────────────
  await app.register(cookie);
  // 🔐 Explicitly declare HS256 — prevents `alg: none` downgrade attacks if
  //    library defaults ever change (RFC 8725 §2.1).
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  // ─── ROUTES ───────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(bybitPlugin);
  await app.register(marketRoutes, { prefix: '/api/market' });
  await app.register(paperRoutes, { prefix: '/api/paper' });
  await app.register(newsletterRoutes, { prefix: '/api/newsletter' });

  // ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns server status, environment, and current timestamp',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              timestamp: { type: 'string', format: 'date-time' },
              environment: { type: 'string', example: 'development' },
            },
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
    })
  );

  return app;
}
