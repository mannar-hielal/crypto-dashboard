import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export const authPlugin = fp(async (app: FastifyInstance) => {
  // Adds app.authenticate — a hook you put on any route to protect it
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                await request.jwtVerify();
            } catch {
                reply.status(401).send({ error: 'Unauthorized' });
            }
  });
});

// Extend Fastify's type definitions so TypeScript knows about app.authenticate
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
