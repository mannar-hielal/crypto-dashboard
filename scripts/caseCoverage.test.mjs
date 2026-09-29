/** scripts/caseCoverage.mjs (F12): `node --test scripts/` (pnpm test:scripts). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverage, planRows, titleTags } from './caseCoverage.mjs';

const plan = `
| #     | Action | Status | Tier |
| ----- | ------ | ------ | ---- |
| 14.6.1 | buy   | ✅     | T1   |
| 14.6.2 | sell  | ⬜     | T3   |
| 9.8   | gone  | ➖     | —    |
| 9.9   | tick  | ⚠️     | T2   |
`;

test('planRows reads each row once with its status', () => {
  assert.deepEqual(
    [...planRows(plan)],
    [
      ['14.6.1', '✅'],
      ['14.6.2', '⬜'],
      ['9.8', '➖'],
      ['9.9', '⚠️'],
    ]
  );
});

test('titleTags reads bracketed IDs from test / it / describe titles only', () => {
  const src = `
    test('[14.6.1][14.6.2] a round trip @full', async () => {});
    it("should show the spread [9.9]", () => {});
    describe.skip(\`[1.2.3] skipped too\`, () => {});
    const note = '[7.7.7] not a title';
  `;
  assert.deepEqual([...titleTags(src)].sort(), ['1.2.3', '14.6.1', '14.6.2', '9.9']);
});

test('titleTags also reads (x.y.z) IDs, but only ones that are rows', () => {
  const src = `it('should show the fee (14.6.1, 9.9) and a price (1.5)', () => {});`;
  assert.deepEqual([...titleTags(src, planRows(plan))].sort(), ['14.6.1', '9.9']);
});

test('coverage lists untested rows (not ➖), unknown tags and ⬜ rows that have a test', () => {
  const r = coverage(planRows(plan), new Map([['a.spec.ts', new Set(['14.6.2', '4.4.4'])]]));
  assert.deepEqual(r.untested, ['14.6.1', '9.9']);
  assert.deepEqual(r.unknown, [{ id: '4.4.4', files: ['a.spec.ts'] }]);
  assert.deepEqual(r.flippable, ['14.6.2']);
});
