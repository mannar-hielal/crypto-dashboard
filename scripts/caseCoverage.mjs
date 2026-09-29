/**
 * Case-ID coverage report (docs/TEST_IMPLEMENTATION_PLAN.md F12). Test titles carry the Part B case
 * IDs of docs/TRADING_TEST_PLAN.md in square brackets (`[14.6.1]`); this lists
 *   - rows with no test citing them,
 *   - tags citing an ID that isn't a row (a typo, or a row renumbered),
 *   - ⬜ rows that already have a test (flip them).
 * `pnpm case-coverage`. A report, not a gate (exit 0), except with `--strict`: then unknown IDs and
 * ⬜ rows with a test fail it.
 */

import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/* eslint-disable security/detect-non-literal-fs-filename -- a dev tool reading this repo's own
   docs and test files, never a path from outside */

/** Part B rows: `| 14.6.1 | … | ✅ | …` → { id, status }; status is the first ✅ / ⬜ / ⚠️ / ➖ cell. */
export function planRows(markdown) {
  const rows = new Map();
  // eslint-disable-next-line security/detect-unsafe-regex -- this repo's docs and test titles only
  const rowStart = /^\| (\d+(?:\.\d+)+) +\|/;
  for (const line of markdown.split('\n')) {
    const m = rowStart.exec(line);
    if (!m || rows.has(m[1])) continue;
    const status = line
      .split('|')
      .map((c) => c.trim())
      .find((c) => ['✅', '⬜', '⚠️', '➖'].includes(c));
    rows.set(m[1], status ?? '');
  }
  return rows;
}

/**
 * The case IDs in a test file's `it(` / `test(` / `describe(` titles: `[x.y.z]` tags (the convention),
 * plus older titles' `(x.y.z)` / `(x.y.z, x.y.z)` — those only when `rows` has them, since a bare
 * `(1.5)` may just be a number.
 */
export function titleTags(source, rows = new Map()) {
  const tags = new Set();
  // eslint-disable-next-line security/detect-unsafe-regex -- run on this repo's test files only
  const title = /\b(?:it|test|describe)(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  for (const m of source.matchAll(title)) {
    // eslint-disable-next-line security/detect-unsafe-regex -- this repo's docs and test titles only
    for (const t of m[2].matchAll(/\[(\d+(?:\.\d+)+)\]/g)) tags.add(t[1]);
    for (const group of m[2].matchAll(/\(([^()]*)\)/g)) {
      // eslint-disable-next-line security/detect-unsafe-regex -- this repo's docs and test titles only
      for (const t of group[1].matchAll(/\b(\d+(?:\.\d+)+)\b/g)) {
        if (rows.has(t[1])) tags.add(t[1]);
      }
    }
  }
  return tags;
}

/** The report's three lists, from the plan's rows and each file's tags. */
export function coverage(rows, tagsByFile) {
  const cited = new Map();
  for (const [file, tags] of tagsByFile) {
    for (const id of tags) cited.set(id, [...(cited.get(id) ?? []), file]);
  }
  const untested = [...rows.keys()].filter((id) => !cited.has(id) && rows.get(id) !== '➖');
  const unknown = [...cited.keys()]
    .filter((id) => !rows.has(id))
    .map((id) => ({ id, files: cited.get(id) }));
  const flippable = [...rows.keys()].filter((id) => rows.get(id) === '⬜' && cited.has(id));
  return { untested, unknown, flippable, cited: cited.size, rows: rows.size };
}

function testFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) testFiles(path, out);
    else if (/\.(test|spec)\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

// Run as a script (not imported by the tests)? Compare real paths, not a URL with a raw path: a
// space, a non-ASCII character or a symlink would otherwise skip the report and exit 0 (review #196)
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const root = join(fileURLToPath(import.meta.url), '..', '..');
  const rows = planRows(readFileSync(join(root, 'docs/TRADING_TEST_PLAN.md'), 'utf8'));
  const tagsByFile = new Map(
    testFiles(join(root, 'apps')).map((f) => [
      relative(root, f),
      titleTags(readFileSync(f, 'utf8'), rows),
    ])
  );
  const r = coverage(rows, tagsByFile);
  const out = (s) => process.stdout.write(`${s}\n`);
  out(`Case-ID coverage: ${r.cited} IDs cited by tests, ${r.rows} rows in Part B`);
  out(`\nRows no test cites (${r.untested.length}):\n  ${r.untested.join(', ') || '—'}`);
  out(`\nTags citing no row (${r.unknown.length}):`);
  for (const u of r.unknown) out(`  [${u.id}] in ${u.files.join(', ')}`);
  out(
    `\n⬜ rows that already have a test (${r.flippable.length}):\n  ${r.flippable.join(', ') || '—'}`
  );
  if (process.argv.includes('--strict') && (r.unknown.length || r.flippable.length))
    process.exit(1);
}
