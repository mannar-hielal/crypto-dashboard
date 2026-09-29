/**
 * Starts the fake Bybit feed (TEST_IMPLEMENTATION_PLAN F3) on 127.0.0.1 — never on a public interface.
 *
 *   pnpm --filter @crypto-dashboard/server fake-bybit          # port 4010 (FAKE_BYBIT_PORT to change)
 *
 * Point the server at it with BYBIT_REST_URL=http://localhost:4010 and BYBIT_WS_URL=ws://localhost:4010;
 * move prices with `pnpm feed …` (tools/feedCtl.ts).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { buildFakeBybit } from './server.js';
import type { Recorded } from './feed.js';

const log = pino({ name: 'fakeBybit' });
const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/bybit/recorded.json'
);
const port = Number(process.env.FAKE_BYBIT_PORT ?? 4010);

// A fixed path inside the repo (no input reaches it)

const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Recorded;
const ageDays = (Date.now() - Date.parse(recorded.recordedAt)) / 86_400_000;
if (ageDays > 180) {
  log.warn(
    { recordedAt: recorded.recordedAt },
    'Bybit fixtures are over 180 days old — pnpm record:bybit'
  );
}

const { app } = await buildFakeBybit({ recorded });
await app.listen({ host: '127.0.0.1', port });
log.info({ port, recordedAt: recorded.recordedAt }, 'Fake Bybit feed listening');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
