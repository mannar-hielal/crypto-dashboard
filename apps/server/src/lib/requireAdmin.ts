import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

/**
 * 🔐 onRequest hook that follows `app.authenticate`: only the configured admin passes, everyone
 * else gets a 403. The server is the real check — a client-side redirect only hides the page.
 * Admin is `config.adminEmail` today; moving to an `ADMIN_USER_IDS` allowlist
 * (docs/SMART_WATCHER_BOT.md §9) changes this one function.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as { userId: string; email: string } | undefined;
  if (!user || user.email !== config.adminEmail) {
    return reply.status(403).send({ error: 'Forbidden' });
  }
}
