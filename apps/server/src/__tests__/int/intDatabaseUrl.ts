/**
 * The integration database: `TEST_DATABASE_URL`, else the local default below. One source for
 * vitest.int.config.ts (the workers' env) and globalSetup (which runs in the main process and
 * never sees `test.env`). Deliberately not `DATABASE_URL`: in a developer's shell that is usually
 * the dev database.
 */
export const DEFAULT_INT_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/crypto_dashboard_int';

export function intDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL || DEFAULT_INT_DATABASE_URL;
}
