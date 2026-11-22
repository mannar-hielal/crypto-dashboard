/**
 * The web app's redirects (`node --test scripts/`, pnpm test:scripts): Cloudflare Pages reads
 * apps/client/public/_redirects top to bottom, so a removed page's 301 must come above the SPA
 * fallback. /features became /how-it-works (2026-11-22).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../apps/client/public/_redirects', import.meta.url));
// A fixed file in this repository, not user input
// eslint-disable-next-line security/detect-non-literal-fs-filename
const RULES = readFileSync(FILE, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(/\s+/));

test('should 301 the removed /features page to /how-it-works, above the SPA fallback', () => {
  const moved = RULES.findIndex((r) => r[0] === '/features');
  const fallback = RULES.findIndex((r) => r[0] === '/*');
  assert.ok(moved >= 0, '/features has a rule');
  assert.deepEqual(RULES[moved], ['/features', '/how-it-works', '301']);
  assert.ok(fallback > moved, 'the fallback comes after the 301');
});

test('should keep the SPA fallback as the last rule', () => {
  assert.deepEqual(RULES.at(-1), ['/*', '/index.html', '200']);
});
