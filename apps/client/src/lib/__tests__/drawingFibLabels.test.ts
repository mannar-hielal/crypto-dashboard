/**
 * The fork's Fib pill labels (a local change, owner's visual Q&A 2026-10-04): with
 * setFibLabelMode('pill') each level of a Fib retracement / trend-based extension gets a pill —
 * `61.8% · 83183.52`, white on the level colour — at the level's right end; TradingView's
 * ordering (1 at the first point, 0 at the second), level colours and fills stay.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { defaultStyleFor, sceneOf, setFibLabelMode } from 'lightweight-charts-drawing';
import type { Drawing, SceneItem } from 'lightweight-charts-drawing';

// y = 1000 − price; the Fib from price 900 (x 100) to 1000 (x 200)
const coords = {
  priceToY: (p: number) => 1000 - p,
  pipSize: () => 0.01,
  isLog: () => false,
} as never;

function fib(): Drawing {
  return {
    id: 'f',
    kind: 'fib-retracement',
    points: [
      { time: 1 as never, price: 900 },
      { time: 2 as never, price: 1000 },
    ],
    style: defaultStyleFor('fib-retracement'),
  } as Drawing;
}

const flat = (items: readonly SceneItem[]): SceneItem[] =>
  items.flatMap((i) => (i.t === 'group' ? flat(i.items) : [i]));

const texts = (items: readonly SceneItem[]) =>
  flat(items).filter((i): i is Extract<SceneItem, { t: 'text' }> => i.t === 'text');

function render() {
  return sceneOf(
    fib(),
    [
      { x: 100, y: 100 },
      { x: 200, y: 0 },
    ],
    { w: 400, h: 300, coords, selected: false }
  );
}

afterEach(() => setFibLabelMode('tradingview'));

describe('Fib pill labels', () => {
  it('[10.7.10] should draw each level as a pill “61.8% · price” at the right end, white on the level colour', () => {
    setFibLabelMode('pill');
    const scene = render();
    const label = texts(scene).find((t) => t.text.startsWith('61.8%'))!;
    // TradingView order: 0 at the second point (1000), 1 at the first (900)
    expect(label.text).toBe('61.8% · 938.20');
    expect(label.fill).toBe('#ffffff');
    expect(label.x).toBeGreaterThan(190);
    const pill = flat(scene).find(
      (i): i is Extract<SceneItem, { t: 'rect' }> =>
        i.t === 'rect' && Math.abs(i.y + i.h / 2 - label.y) < 0.01
    )!;
    expect(pill.x).toBeLessThan(label.x);
    expect(pill.fillOpacity).toBe(0.8);
    expect(texts(scene).some((t) => t.text.startsWith('0% · 1000.00'))).toBe(false);
    expect(texts(scene).some((t) => t.text === '0.0% · 1000.00')).toBe(true);
    expect(texts(scene).some((t) => t.text === '100.0% · 900.00')).toBe(true);
  });

  it('should keep TradingView’s plain labels by default', () => {
    expect(texts(render()).some((t) => t.text.includes('·'))).toBe(false);
  });

  it('should keep the pill inside the pane when the level runs to the right edge', () => {
    setFibLabelMode('pill');
    const d = fib();
    d.style = { ...d.style, extendRight: true };
    const scene = sceneOf(
      d,
      [
        { x: 100, y: 100 },
        { x: 200, y: 0 },
      ],
      { w: 400, h: 300, coords, selected: false }
    );
    for (const r of flat(scene)) if (r.t === 'rect') expect(r.x + r.w).toBeLessThanOrEqual(400);
  });
});
