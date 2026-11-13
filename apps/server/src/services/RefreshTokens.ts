/**
 * Refresh-token housekeeping (the reuse window, owner 2026-11-13). `/refresh` keeps a rotated row
 * for `REFRESH_REUSE_WINDOW_MS` so a reply lost in transit can be recovered; this removes the rows
 * nobody can use any more: rotated past the window, or expired. The daily job runs it, so rows
 * don't pile up for a user who rotates once and never refreshes again (review on #288).
 */

import type { FastifyInstance } from 'fastify';

type Prisma = FastifyInstance['prisma'];

/** How long a rotated refresh token is still served again (a lost reply, a second tab) */
export const REFRESH_REUSE_WINDOW_MS = 30_000;

/** How many times one rotated token may be served again inside the window (a lost reply, a tab) */
export const REFRESH_REUSE_CAP = 2;

export async function purgeStaleRefreshTokens(
  prisma: Prisma,
  now: Date = new Date()
): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { rotatedAt: { lt: new Date(now.getTime() - REFRESH_REUSE_WINDOW_MS) } },
        { expiresAt: { lt: now } },
      ],
    },
  });
  return count;
}
