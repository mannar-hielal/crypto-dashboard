import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { prismaPlugin } from './plugins/prisma.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth/index.js';

export async function buildApp() {
  const app = Fastify({
    // Disable Fastify's logger in tests to reduce terminal noise
    logger: config.nodeEnv === 'test' ? false : { level: config.logLevel },
  });

  // ─── SECURITY PLUGINS ─────────────────────────────────────────────────────
  await app.register(helmet);
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
  await app.register(cors, {
    origin: config.nodeEnv === 'production' ? config.corsOrigin : true,
    credentials: true,
  });

  // ─── CORE PLUGINS ─────────────────────────────────────────────────────────
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  // ─── ROUTES ───────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/auth' });

  // ─── HEALTH CHECK ─────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  }));

  return app;
}
