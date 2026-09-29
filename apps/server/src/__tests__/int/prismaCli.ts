/**
 * Runs the Prisma CLI against the integration database (the `DATABASE_URL` the int config sets).
 * Used by globalSetup and the migration tests — test tooling only, never application code.
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/server — where prisma.config.ts lives */
export const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export interface CliResult {
  status: number | null;
  output: string;
}

/**
 * `prisma <args>` with a fixed argument list (no shell), the database URL from the environment.
 * `input` is written to stdin (`db execute --stdin`).
 */
export function prisma(args: string[], databaseUrl: string, input?: string): CliResult {
  const res = spawnSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    input,
  });
  // res.error: the CLI never started (pnpm not on PATH, wrong cwd) — say so instead of an empty output
  const spawnError = res.error ? `${res.error.message}\n` : '';
  return { status: res.status, output: `${spawnError}${res.stdout ?? ''}${res.stderr ?? ''}` };
}

/** 🔐 The tests delete every row they can reach, so only a database named *_int or *_test is used. */
export function assertThrowawayDatabase(databaseUrl: string): void {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!/_(int|test)$/.test(name)) {
    throw new Error(
      `Refusing to use database "${name}": integration tests only run on a database whose name ends in _int or _test`
    );
  }
}
