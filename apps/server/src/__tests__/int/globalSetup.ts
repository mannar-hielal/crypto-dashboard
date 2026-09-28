/**
 * Integration-test global setup: brings the throwaway database up to date with every committed
 * migration (`prisma migrate deploy` — never a destructive reset). In CI the database starts
 * empty, so this is the migrate-from-empty check; locally a re-run is a no-op. Each test file
 * clears its own rows (db.ts cleanDatabase). migrations.int.test.ts then checks for drift.
 */

import { assertThrowawayDatabase, prisma } from './prismaCli.js';

export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  assertThrowawayDatabase(url);

  const deploy = prisma(['migrate', 'deploy'], url);
  if (deploy.status !== 0) {
    throw new Error(`prisma migrate deploy failed:\n${deploy.output}`);
  }
}
