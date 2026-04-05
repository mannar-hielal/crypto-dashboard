import websocket from '@fastify/websocket';
import bybitPlugin from './plugins/bybit.js';
import { marketRoutes } from './routes/market/index.js';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config.js';
import { prismaPlugin } from './plugins/prisma.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth/index.js';

export async function buildApp() {
  const app = Fastify({
    // Disable Fastify's logger in tests to reduce terminal noise
    logger: config.nodeEnv === 'test' ? false : { level: config.logLevel },
  });

  // ─── API DOCUMENTATION ────────────────────────────────────────────────────
  // Swagger reads your route schemas and auto-generates an OpenAPI 3.0 spec.
  // Must be registered BEFORE routes so it can pick them up.
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Crypto Dashboard API',
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
    // that helmet's strict default CSP would block. In production CSP is fully on.
    contentSecurityPolicy: config.nodeEnv === 'production',
  });
  // Skip rate limiting in test — prevents flaky tests caused by per-IP counters
  if (config.nodeEnv !== 'test') {
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });
  }
  await app.register(cors, {
    origin: config.nodeEnv === 'production' ? config.corsOrigin : true,
    credentials: true,
  });

  // WebSocket support — must be registered before any websocket routes
  await app.register(websocket);

  // ─── CORE PLUGINS ─────────────────────────────────────────────────────────────
  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  // ─── ROUTES ───────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(bybitPlugin);
  await app.register(marketRoutes, { prefix: '/api/market' });

  // ─── CUSTOM ERROR HANDLER ─────────────────────────────────────────────────
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
      void reply.status(statusCode).send({ error: 'Internal Server Error' });
      return;
    }

    void reply.status(statusCode).send({ error: error.message ?? 'Bad Request' });
  });

  // ─── HEALTH CHECK ─────────────────────────────────────────────────────────
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
