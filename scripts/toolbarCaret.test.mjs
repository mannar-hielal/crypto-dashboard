/**
 * The drawing toolbar's menu arrow (apps/client/src/index.css): hidden at rest only where a pointer
 * can hover. A touch screen has no hover to reveal it, so there it stays visible (review #241).
 * jsdom can't evaluate a hover media query, so this reads the stylesheet: `pnpm test:scripts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';

const CSS_FILE = fileURLToPath(new URL('../apps/client/src/index.css', import.meta.url));
// A fixed file in this repository, not user input
// eslint-disable-next-line security/detect-non-literal-fs-filename
const CSS = readFileSync(CSS_FILE, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ');

test('the toolbar arrow is hidden at rest only inside @media (hover: hover)', () => {
  assert.match(CSS, /@media \(hover: hover\) \{ \.toolbar-caret \{ opacity: 0; \} \}/);
});

test('the base .toolbar-caret rule never hides the arrow (touch keeps it visible)', () => {
  const base = CSS.match(/(?:^|\}) \.toolbar-caret \{[^}]*\}/);
  assert.ok(base, 'the base .toolbar-caret rule is there');
  assert.doesNotMatch(base[0], /opacity: 0/);
});

test('on touch screens the arrow has a 24 px touch target', () => {
  assert.match(
    CSS,
    /@media \(hover: none\) \{ \.toolbar-caret::before \{[^}]*width: 24px;[^}]*\} \}/
  );
});

test('toolbar icons sit in a fixed 22 px box, so corner badges keep their place', () => {
  assert.match(CSS, /\.toolbar-icon \{ width: 22px; height: 22px; \}/);
});
