/**
 * 🔐 The web app's security headers (docs/HARDENING_PLAN.md H0): `node --test scripts/` (pnpm
 * test:scripts). Cloudflare Pages sends what apps/client/public/_headers declares; the API's Helmet
 * headers never reach the pages. The @prod smoke checks the live site; this catches a removal at PR time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';

const HEADERS_FILE = fileURLToPath(new URL('../apps/client/public/_headers', import.meta.url));
// A fixed file in this repository, not user input
// eslint-disable-next-line security/detect-non-literal-fs-filename
const HEADERS = readFileSync(HEADERS_FILE, 'utf8');

/** Cloudflare's format: a path line, then indented `Name: value` lines; `#` starts a comment. */
export function parseHeaders(text) {
  const rules = new Map();
  let current;
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = new Map();
      rules.set(raw.trim(), current);
      continue;
    }
    const i = raw.indexOf(':');
    if (current && i > 0)
      current.set(raw.slice(0, i).trim().toLowerCase(), raw.slice(i + 1).trim());
  }
  return rules;
}

test('parseHeaders reads paths, headers and skips comments', () => {
  const rules = parseHeaders('# c\n/*\n  X-A: 1\n  # c\n/b\n  X-B: two: parts\n');
  assert.equal(rules.get('/*').get('x-a'), '1');
  assert.equal(rules.get('/b').get('x-b'), 'two: parts');
  assert.equal(rules.size, 2);
});

test('every page gets HSTS for the domain and its subdomains', () => {
  const all = parseHeaders(HEADERS).get('/*');
  assert.ok(all, '_headers has no /* rule');
  const hsts = all.get('strict-transport-security') ?? '';
  assert.match(hsts, /max-age=(\d+)/);
  assert.ok(Number(/max-age=(\d+)/.exec(hsts)[1]) >= 31_536_000, 'HSTS max-age under a year');
  assert.match(hsts, /includeSubDomains/);
});

test('no other site may frame the app (clickjacking)', () => {
  const all = parseHeaders(HEADERS).get('/*');
  assert.equal(all.get('x-frame-options'), 'DENY');
  assert.match(all.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
});
