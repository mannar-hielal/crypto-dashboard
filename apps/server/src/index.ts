import { buildApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

try {
  // buildApp is inside try so plugin failures (Prisma, JWT…) are caught and
  // logged cleanly instead of crashing as an unhandled top-level rejection.
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`🚀 Server running on http://localhost:${config.port}`);
} catch (err) {
  logger.error(err, 'Fatal startup error');
  process.exit(1);
}
