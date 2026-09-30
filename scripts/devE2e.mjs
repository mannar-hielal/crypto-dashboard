/**
 * `pnpm dev:e2e` — the app on the fake Bybit feed (docs/TRADING_TEST_PLAN.md A5): the "local dev
 * (fake feed)" environment every step of docs/UI_REPRODUCTIONS.md marked (fake feed) refers to.
 *
 * Starts the fake feed (:4010), the server pointed at it (:3001) and Vite (:5173). Move prices with
 * `pnpm feed …`. The test hooks (/api/test/*) are on only when TEST_HOOKS_SECRET is set in your shell
 * (16+ characters). Ctrl+C stops all three.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

const FEED_PORT = process.env.FAKE_BYBIT_PORT ?? '4010';
const hooks = process.env.TEST_HOOKS_SECRET ? { ENABLE_TEST_HOOKS: '1' } : {};

const processes = [
  ['feed', ['--filter', '@crypto-dashboard/server', 'fake-bybit'], {}],
  [
    'server',
    ['--filter', '@crypto-dashboard/server', 'dev'],
    {
      BYBIT_REST_URL: `http://127.0.0.1:${FEED_PORT}`,
      BYBIT_WS_URL: `ws://127.0.0.1:${FEED_PORT}`,
      ...hooks,
    },
  ],
  ['client', ['--filter', '@crypto-dashboard/client', 'dev'], {}],
].map(([name, args, env]) => {
  const child = spawn('pnpm', args, { stdio: 'inherit', env: { ...process.env, ...env } });
  child.on('exit', (code) => {
    if (code) process.stderr.write(`[dev:e2e] ${name} exited with ${code}\n`);
  });
  return child;
});

const stop = () => {
  for (const child of processes) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
