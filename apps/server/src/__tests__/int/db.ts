/**
 * A Prisma client on the integration database, and a clean slate per test (every user-owned row
 * cascades from User; the rest are deleted explicitly). Test tooling only.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';

export function integrationPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export async function cleanDatabase(db: PrismaClient): Promise<void> {
  await db.user.deleteMany();
  await db.subscriber.deleteMany();
  await db.engineLease.deleteMany();
}

let seq = 0;

/** A user row for an account to belong to. */
export async function createUser(db: PrismaClient): Promise<string> {
  seq += 1;
  const tag = `${Date.now()}-${seq}`;
  const user = await db.user.create({
    data: { email: `int-${tag}@example.test`, username: `int_${tag}`, password: 'not-a-hash' },
  });
  return user.id;
}
