/**
 * Activity days: one row per user per UTC day on which they signed in or resumed their session
 * (privacy policy §3, "Activity days"). It exists so the retention report can see a user who only
 * looks at charts. The account and the date only — no time, IP or device.
 *
 * 🔐 A failure here must never fail a login or a refresh: the write is fire-and-forget with the
 * error logged, never thrown.
 */

import type { FastifyInstance } from 'fastify';

type Prisma = FastifyInstance['prisma'];

/** Rows older than this are purged by the daily job (and stated in the privacy policy) */
export const ACTIVITY_RETENTION_DAYS = 180;

const DAY_MS = 86_400_000;

/** Midnight UTC of the day `d` falls in — what a `@db.Date` column stores */
export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Idempotent: a second call the same day is a no-op (`ON CONFLICT DO NOTHING`) */
export async function recordActivityDay(
  prisma: Prisma,
  userId: string,
  now: Date = new Date()
): Promise<void> {
  await prisma.userActivity.createMany({
    data: [{ userId, day: utcDay(now) }],
    skipDuplicates: true,
  });
}

/** Fire-and-forget for a request handler: never awaited, never throws */
export function trackActivity(app: FastifyInstance, userId: string): void {
  void recordActivityDay(app.prisma, userId).catch((err: unknown) => {
    app.log.warn({ err, service: 'UserActivity' }, 'Could not record an activity day');
  });
}

/** Deletes the days past the retention period; returns how many went */
export async function purgeOldActivity(prisma: Prisma, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(utcDay(now).getTime() - ACTIVITY_RETENTION_DAYS * DAY_MS);
  const { count } = await prisma.userActivity.deleteMany({ where: { day: { lt: cutoff } } });
  return count;
}
