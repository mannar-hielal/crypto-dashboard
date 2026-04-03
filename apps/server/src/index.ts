import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { prismaPlugin } from './plugins/prisma.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth/index.js';

const app = Fastify({
  logger: {
    level: config.logLevel,
  },
});

// ─── SECURITY PLUGINS ─────────────────────────────────────────────────────────
await app.register(helmet); // 🔐 security headers (XSS, clickjacking, etc.)
await app.register(rateLimit, {
  max: 100, // 🔐 global: 100 requests per minute per IP
  timeWindow: '1 minute',
});
await app.register(cors, {
  origin:
    config.nodeEnv === 'production'
      ? config.corsOrigin   // 🔐 locked to CORS_ORIGIN env var in production
      : true,               // allow all origins in development
  credentials: true,
});

// ─── CORE PLUGINS ─────────────────────────────────────────────────────────────
await app.register(jwt, { secret: config.jwtSecret });
await app.register(prismaPlugin);
await app.register(authPlugin);

// ─── ROUTES ───────────────────────────────────────────────────────────────────
await app.register(authRoutes, { prefix: '/api/auth' });

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  environment: config.nodeEnv,
}));

// ─── START ────────────────────────────────────────────────────────────────────
try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`🚀 Server running on http://localhost:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
