import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

export const prismaPlugin = fp(async (app: FastifyInstance) => {
    await prisma.$connect();

    // Makes app.prisma available everywhere in the app
    app.decorate('prisma', prisma);

    // Disconnect when server shuts down
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
