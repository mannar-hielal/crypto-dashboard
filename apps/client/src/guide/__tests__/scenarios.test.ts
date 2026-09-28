/**
 * Every scenario must stay consistent with the anchor registry and the test plan it cites — the
 * same definitions will drive Playwright and the guided tour.
 */

import { describe, expect, it } from 'vitest';
import testPlan from '../../../../../docs/TRADING_TEST_PLAN.md?raw';
import { isGuideAnchor } from '@/lib/guideAnchors';
import { SCENARIOS } from '@/guide/scenarios';
import { defineScenario } from '@/guide/scenario';

/** Case IDs from the test plan's tables: the first cell of a row, e.g. `| 14.6.1 |`. */
const CASE_IDS = new Set([...testPlan.matchAll(/^\|\s*(\d+(?:\.\d+)+)\s*\|/gm)].map((m) => m[1]));

describe('scenarios', () => {
  it('should read the test plan case IDs', () => {
    expect(CASE_IDS.size).toBeGreaterThan(300);
    expect(CASE_IDS.has('14.6.1')).toBe(true);
  });

  it('should have unique kebab-case ids', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  for (const s of SCENARIOS) {
    describe(s.id, () => {
      it('should cite case IDs that exist in docs/TRADING_TEST_PLAN.md', () => {
        expect(s.caseIds.length).toBeGreaterThan(0);
        for (const id of s.caseIds) expect(CASE_IDS.has(id), id).toBe(true);
      });

      it('should number its steps <id>.1, <id>.2, … in order', () => {
        expect(s.steps.map((st) => st.id)).toEqual(s.steps.map((_, i) => `${s.id}.${i + 1}`));
      });

      it('should use registered anchors only, and give every step an explanation', () => {
        for (const st of s.steps) {
          if (st.anchor) expect(isGuideAnchor(st.anchor), `${st.id} ${st.anchor}`).toBe(true);
          for (const e of st.expect ?? []) {
            if ('anchor' in e) expect(isGuideAnchor(e.anchor), `${st.id} ${e.anchor}`).toBe(true);
          }
          expect(st.explain.trim().length, st.id).toBeGreaterThan(0);
        }
      });

      it('should target an element on every step a person performs or reads', () => {
        for (const st of s.steps) {
          if (st.action === 'navigate' || st.action === 'control') {
            expect(st.value, st.id).toBeTruthy();
          } else {
            expect(st.anchor, st.id).toBeTruthy();
          }
          if (st.action === 'type' || st.action === 'select') expect(st.value, st.id).toBeDefined();
        }
      });

      it('should start on a dashboard or public path', () => {
        expect(s.startUrl).toMatch(/^\//);
      });
    });
  }

  it('defineScenario should flatten builder arrays and number the steps', () => {
    const s = defineScenario({
      id: 'demo',
      title: 'Demo',
      caseIds: ['14.6.1'],
      startUrl: '/dashboard/spot/BTC/USDT',
      preconditions: [],
      tags: ['@full'],
      steps: [
        { action: 'click', anchor: 'trade.submit', explain: 'One.' },
        [
          { action: 'click', anchor: 'trade.tp.enable', explain: 'Two.' },
          { action: 'type', anchor: 'trade.tp.price', value: '52000', explain: 'Three.' },
        ],
      ],
    });
    expect(s.steps.map((st) => st.id)).toEqual(['demo.1', 'demo.2', 'demo.3']);
  });
});
