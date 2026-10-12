import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

/** Registration lower-cases and trims e-mails; the configured admin address is compared the same way */
const normalise = (email: string) => email.trim().toLowerCase();

/**
 * 🔐 onRequest hook that follows `app.authenticate`: only the configured admin passes, everyone
 * else gets a 403. The server is the real check — a client-side redirect only hides the page.
 *
 * The token's `email` claim only gets a request as far as the database: it can be stale (an
 * address changed since the token was signed) and a token can be obtained before an address is
 * verified. So the account is read by `userId` and must have the admin address *now* and a
 * verified one, and not be pending deletion. Anyone whose claim is not the admin address is
 * refused without a lookup.
 *
 * Admin is `config.adminEmail` today; moving to an `ADMIN_USER_IDS` allowlist
 * (docs/SMART_WATCHER_BOT.md §9) changes this one function.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const claim = request.user as { userId: string; email: string } | undefined;
  const admin = normalise(config.adminEmail);
  if (!claim || normalise(claim.email) !== admin) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const user = await request.server.prisma.user.findUnique({
    where: { id: claim.userId },
    select: { email: true, emailVerifiedAt: true, deletionRequestedAt: true },
  });
  // An account that has asked to be deleted is on its way out: it is no longer an admin
  if (
    !user ||
    !user.emailVerifiedAt ||
    user.deletionRequestedAt ||
    normalise(user.email) !== admin
  ) {
    return reply.status(403).send({ error: 'Forbidden' });
  }
}
