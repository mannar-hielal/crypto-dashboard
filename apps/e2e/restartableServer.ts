/**
 * A second API server that a test can crash and start again (TEST_IMPLEMENTATION_PLAN A4
 * Resilience; SC-13.2-3, SC-18-1). It has its own port and its own throwaway database, so its
 * matching engine never competes with the main e2e server's for the engine lease, and killing it
 * leaves every other spec untouched. It reads the same fake feed. Stopping is a kill -9 of its whole
 * process tree, like a crash: the lease isn't released, so the next start waits for it to expire.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOOKS_SECRET, apiEnv } from './env';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface RestartableServer {
  url: string;
  /** Everything the server has printed so far (all starts) */
  logs: () => string;
  /** Start (or start again); `keepLease` keeps the previous engine's last tick for the backfill */
  start: (opts?: { keepLease?: boolean }) => Promise<void>;
  /** Kill -9 the whole process tree (a crash) and wait until it is gone */
  crash: () => Promise<void>;
  hooks: (path: string, body?: unknown) => Promise<unknown>;
}

export function restartableServer(port: number, databaseUrl: string): RestartableServer {
  const url = `http://localhost:${port}`;
  let proc: ChildProcess | null = null;
  let out = '';

  const healthy = async () => {
    try {
      return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(2_000) })).ok;
    } catch {
      return false;
    }
  };

  return {
    url,
    logs: () => out,
    async start({ keepLease = false } = {}) {
      proc = spawn('node', ['scripts/startServer.mjs'], {
        cwd: HERE,
        detached: true, // its own process group: crash() kills pnpm → tsx → node together
        env: {
          ...process.env,
          ...apiEnv(port, databaseUrl),
          LOG_LEVEL: 'info', // "Backfilling price gap" is an info line
          E2E_KEEP_ENGINE_LEASE: keepLease ? '1' : '',
        },
      });
      proc.stdout?.on('data', (d: Buffer) => (out += d.toString()));
      proc.stderr?.on('data', (d: Buffer) => (out += d.toString()));
      const deadline = Date.now() + 120_000;
      while (!(await healthy())) {
        if (Date.now() > deadline)
          throw new Error(`API on ${port} didn't start:\n${out.slice(-2_000)}`);
        await new Promise((r) => setTimeout(r, 500));
      }
    },
    async crash() {
      if (!proc?.pid) return;
      // Called from a spec's `finally`: never throw over the real error, never wait on an exit
      // that already happened
      if (proc.exitCode === null && proc.signalCode === null) {
        const exited = new Promise((r) => proc?.once('exit', r));
        try {
          process.kill(-proc.pid, 'SIGKILL');
          await exited;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err; // the group is gone already
        }
      }
      while (await healthy()) await new Promise((r) => setTimeout(r, 200));
      proc = null;
    },
    async hooks(path, body = {}) {
      const res = await fetch(`${url}/api/test${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-hooks-secret': HOOKS_SECRET },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`hooks ${path}: HTTP ${res.status} ${await res.text()}`);
      return res.json();
    },
  };
}
