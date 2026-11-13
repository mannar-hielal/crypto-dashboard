/**
 * Refresh-token housekeeping (the reuse window, owner 2026-11-13). `/refresh` keeps a rotated row
 * until it expires: within `REFRESH_REUSE_WINDOW_MS` it can be served again (a lost reply, a second
 * tab), and after that a replay of it is the theft signal, which needs the row (review on #288).
 * The daily job removes expired rows, and rotated rows past `ROTATED_TOKEN_RETENTION_MS`.
 */

import type { FastifyInstance } from 'fastify';

type Prisma = FastifyInstance['prisma'];

/** How long a rotated refresh token is still served again (a lost reply, a second tab) */
export const REFRESH_REUSE_WINDOW_MS = 30_000;

/** How many times one rotated token may be served again inside the window (a lost reply, a tab) */
export const REFRESH_REUSE_CAP = 2;

/**
 * How long a rotated row is kept, for the theft signal: a replay found within this ends its
 * sign-in's family; after it, a replay gets a plain 401 (review on #288). A deliberate choice: 7
 * days, the refresh token's own lifetime, so a stolen token is caught for as long as it could
 * ever be used. Sizing: one row per refresh (about every 15 minutes), so about 670 rows a week per
 * active user, all gone within the week. Lookups go by the unique `tokenHash` and the
 * `familyId` index, so the count doesn't slow them. Lower it if the table ever grows uncomfortably,
 * at the cost of a shorter theft signal
 */
export const ROTATED_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function purgeStaleRefreshTokens(
  prisma: Prisma,
  now: Date = new Date()
): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { rotatedAt: { lt: new Date(now.getTime() - ROTATED_TOKEN_RETENTION_MS) } },
      ],
    },
  });
  return count;
}
