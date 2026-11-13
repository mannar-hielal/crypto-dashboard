/**
 * Refresh-token housekeeping (the reuse window, owner 2026-11-13). `/refresh` keeps a rotated row
 * until it expires: within `REFRESH_REUSE_WINDOW_MS` it can be served again (a lost reply, a second
 * tab), and after that a replay of it is the theft signal, which needs the row (review on #288).
 * The daily job removes expired rows, rotated or not.
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
    where: { expiresAt: { lt: now } },
  });
  return count;
}
