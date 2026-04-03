import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../config.js';

// 🔐 Prisma 7 uses explicit driver adapters instead of implicit env reading
const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prisma = new PrismaClient({ adapter });

export const prismaPlugin = fp(async (app: FastifyInstance) => {
  await prisma.$connect();

  // Makes app.prisma available everywhere in the app
  app.decorate('prisma', prisma);

  // Disconnect cleanly when server shuts down
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});

// Extend Fastify's type definitions so TypeScript knows about app.prisma
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
