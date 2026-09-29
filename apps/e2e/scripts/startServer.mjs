/**
 * Starts the API server for the e2e run (docs/TEST_IMPLEMENTATION_PLAN.md F4): creates the throwaway
 * database if it doesn't exist, migrates it (`prisma migrate deploy`, never a reset), then runs the
 * server on the fake Bybit feed with the test hooks on (clearing a stale engine lease first).
 * Playwright's webServer runs it.
 */

import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { URL } from 'node:url';

const url = process.env.DATABASE_URL ?? '';
const name = new URL(url).pathname.slice(1);
// 🔐 Only ever a throwaway database
if (!/_test$/.test(name)) {
  process.stderr.write(`Refusing to run e2e on database "${name}": its name must end in _test\n`);
  process.exit(1);
}

const prisma = (args, env = {}, input) =>
  spawnSync('pnpm', ['--filter', '@crypto-dashboard/server', 'exec', 'prisma', ...args], {
    env: { ...process.env, ...env },
    input,
    encoding: 'utf8',
  });

// CREATE DATABASE from the server's default database; "already exists" is fine
const admin = new URL(url);
admin.pathname = '/postgres';
const created = prisma(
  ['db', 'execute', '--stdin'],
  { DATABASE_URL: admin.toString() },
  `CREATE DATABASE "${name}";`
);
if (created.status !== 0 && !/already exists/.test(`${created.stdout}${created.stderr}`)) {
  process.stderr.write(`Could not create ${name}:\n${created.stdout}${created.stderr}`);
  process.exit(1);
}
const migrated = prisma(['migrate', 'deploy']);
if (migrated.status !== 0) {
  process.stderr.write(`prisma migrate deploy failed:\n${migrated.stdout}${migrated.stderr}`);
  process.exit(1);
}

// A server killed by an earlier run leaves its matching-engine lease behind; the new engine would
// wait for it to expire (30 s) and miss the price moves of the first tests. A restart test keeps it
// (E2E_KEEP_ENGINE_LEASE=1): its last tick is where the downtime backfill starts
const keepLease = process.env.E2E_KEEP_ENGINE_LEASE === '1';
const lease = keepLease
  ? { status: 0 }
  : prisma(['db', 'execute', '--stdin'], {}, 'DELETE FROM "EngineLease";');
if (lease.status !== 0) {
  process.stderr.write(`Could not clear the engine lease:\n${lease.stdout}${lease.stderr}`);
  process.exit(1);
}

const server = spawn(
  'pnpm',
  ['--filter', '@crypto-dashboard/server', 'exec', 'tsx', 'src/index.ts'],
  {
    stdio: 'inherit',
    env: process.env,
  }
);
const stop = () => server.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
