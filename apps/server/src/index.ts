import { buildApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { EmailService } from './services/EmailService.js';

type AppInstance = Awaited<ReturnType<typeof buildApp>>;

async function startPurgeJob(app: AppInstance) {
  const PURGE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

  const runPurge = async () => {
    app.log.info('🗑️ Starting daily account purge job...');
    const now = new Date();

    try {
      // 1. 7-day warning pass (23 days after request)
      const warningThreshold = new Date(now.getTime() - 23 * 24 * 60 * 60 * 1000);
      const usersToWarn = await app.prisma.user.findMany({
        where: {
          deletionRequestedAt: { lte: warningThreshold },
          deletionWarningSentAt: null,
        },
      });

      for (const user of usersToWarn) {
        const deletionDate = new Date(
          user.deletionRequestedAt!.getTime() + 30 * 24 * 60 * 60 * 1000
        );
        await EmailService.sendDeletionWarningEmail(user.email, user.username, deletionDate);
        await app.prisma.user.update({
          where: { id: user.id },
          data: { deletionWarningSentAt: now },
        });
      }

      if (usersToWarn.length > 0) {
        app.log.info({ count: usersToWarn.length }, 'Sent 7-day deletion warning emails');
      }

      // 2. Hard-delete pass (30 days after request)
      const deleteThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const usersToDelete = await app.prisma.user.findMany({
        where: {
          deletionRequestedAt: { lte: deleteThreshold },
        },
      });

      for (const user of usersToDelete) {
        await EmailService.sendDeletionCompletedEmail(user.email, user.username);
        await app.prisma.user.delete({ where: { id: user.id } });
      }

      if (usersToDelete.length > 0) {
        app.log.info({ count: usersToDelete.length }, 'Permanently deleted accounts');
      }
    } catch (err) {
      app.log.error(err, 'Error during account purge job');
    }
  };

  // Run once on startup, then every 24 hours
  void runPurge();
  setInterval(runPurge, PURGE_INTERVAL);
}

try {
  // buildApp is inside try so plugin failures (Prisma, JWT…) are caught and
  // logged cleanly instead of crashing as an unhandled top-level rejection.
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`🚀 Server running on http://localhost:${config.port}`);

  // Run the purge job only on a designated worker/instance.
  if (process.env.RUN_PURGE_JOB === 'true') {
    void startPurgeJob(app);
  }
} catch (err) {
  logger.error(err, 'Fatal startup error');
  process.exit(1);
}
