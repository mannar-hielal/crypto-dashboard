/**
 * Refresh-token housekeeping (the reuse window, owner 2026-11-13). `/refresh` keeps a rotated row
 * until it expires: within `REFRESH_REUSE_WINDOW_MS` it can be served again (a lost reply, a second
 * tab), and after that a replay of it is the theft signal, which needs the row (review on #288).
 * The daily job removes expired rows.
 */

import type { FastifyInstance } from 'fastify';

type Prisma = FastifyInstance['prisma'];

/** How long a rotated refresh token is still served again (a lost reply, a second tab) */
export const REFRESH_REUSE_WINDOW_MS = 30_000;

/**
 * How many times one rotated token may be served again inside the window: the client's reconnect
 * retries (`SESSION_RECONNECT_TRIES` in the SDK, 3) plus one for a second tab. A test holds it above
 * the client's retries, or a flaky link's last retry would be refused (review on #288)
 */
export const REFRESH_REUSE_CAP = 4;

/** Rows deleted per statement by the purge, so a large first run never locks the table for long */
const PURGE_BATCH = 1000;

/**
 * Deletes expired rows, rotated or not, in batches. A rotated row is kept until it expires: a
 * deliberate retention equal to the token's own 7-day lifetime, so a stolen token is caught for as
 * long as it could ever be used (`security.md`). Sizing: about 670 rows a week per active user,
 * all gone within the week; `expiresAt` is indexed for this query (review on #288)
 */
export async function purgeStaleRefreshTokens(
  prisma: Prisma,
  now: Date = new Date()
): Promise<number> {
  let total = 0;
  for (;;) {
    const batch = await prisma.refreshToken.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true },
      take: PURGE_BATCH,
    });
    if (batch.length === 0) return total;
    const { count } = await prisma.refreshToken.deleteMany({
      where: { id: { in: batch.map((r) => r.id) } },
    });
    total += count;
    if (batch.length < PURGE_BATCH) return total;
  }
}

/**
 * The daily job's refresh-token step, on its own: a failure here is logged with its own message
 * and never thrown, and a failure in another step never skips this one (review on #288)
 */
export async function runRefreshTokenPurge(
  app: Pick<FastifyInstance, 'prisma' | 'log'>,
  now: Date = new Date()
): Promise<void> {
  try {
    const purged = await purgeStaleRefreshTokens(app.prisma, now);
    if (purged > 0) app.log.info({ count: purged }, 'Purged expired refresh tokens');
  } catch (err) {
    app.log.error(err, 'Error purging expired refresh tokens');
  }
}
