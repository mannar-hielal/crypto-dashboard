import { describe, expect, it } from 'vitest';
import { paneHeights, subPaneTargetIndex } from '../paneLayout';

describe('[10.6.13] paneHeights — equal indicator panes, price pane ≥ 50%', () => {
  // A tall chart: 500 px of pane area. Target per indicator pane = 20% = 100 px; room while the
  // price pane keeps half = 250 px / n.
  it.each([
    // n, each indicator pane, price pane
    [1, 100, 400], // target fits: 20%, price 80%
    [2, 100, 300], // target fits: price 60%
    [3, 250 / 3, 250], // target (300 in all) would leave price < 50%: they shrink to 83.3 each
    [4, 62.5, 250], // still ≥ 60 px
    [5, 50, 250], // below 60 px: accepted, the price pane never drops under half
  ])('%i indicator pane(s) on 500 px → %d px each, price %d px', (n, sub, main) => {
    const h = paneHeights(500, n);
    expect(h.sub).toBeCloseTo(sub, 10);
    expect(h.main).toBeCloseTo(main, 10);
    expect(h.main + h.sub * n).toBeCloseTo(500, 10);
    expect(h.main / 500).toBeGreaterThanOrEqual(0.5);
  });

  it('should give a short chart 60 px panes while the price pane can spare them', () => {
    // 250 px: 20% = 50 px < 60 → 60; room 125 → 60 fits
    expect(paneHeights(250, 1)).toEqual({ main: 190, sub: 60 });
    expect(paneHeights(250, 2)).toEqual({ main: 130, sub: 60 });
  });

  it('should hold the price pane at half on a small 4-chart cell, panes below 60 px', () => {
    // 200 px, 2 panes: 60 each would leave 80 (40%) → 50 each, price 100
    expect(paneHeights(200, 2)).toEqual({ main: 100, sub: 50 });
    // a phone-sized 180 px chart with 3 panes: 30 px each
    expect(paneHeights(180, 3)).toEqual({ main: 90, sub: 30 });
  });

  it('should keep every indicator pane the same height', () => {
    for (let n = 1; n <= 5; n++) {
      const { main, sub } = paneHeights(733, n);
      expect(main + sub * n).toBeCloseTo(733, 10);
    }
  });

  it('should give the whole chart to the price pane with no indicator panes, and survive 0 px', () => {
    expect(paneHeights(500, 0)).toEqual({ main: 500, sub: 0 });
    expect(paneHeights(0, 2)).toEqual({ main: 0, sub: 0 });
  });
});

describe('subPaneTargetIndex', () => {
  const ids = ['mom-1', 'macd-1', 'mom-2'];

  it('should put panes in add order, right below the price pane', () => {
    expect(subPaneTargetIndex(ids, 'mom-1', () => false)).toBe(1);
    expect(subPaneTargetIndex(ids, 'macd-1', (id) => id === 'mom-1')).toBe(2);
    expect(subPaneTargetIndex(ids, 'mom-2', (id) => id !== 'mom-2')).toBe(3);
  });

  it('should slot a re-shown indicator back between its neighbours', () => {
    // mom-1 hidden and shown again while macd-1 and mom-2 have panes: it goes first
    expect(subPaneTargetIndex(ids, 'mom-1', (id) => id !== 'mom-1')).toBe(1);
    // macd-1 shown again: after mom-1, before mom-2
    expect(subPaneTargetIndex(ids, 'macd-1', (id) => id !== 'macd-1')).toBe(2);
  });

  it('should skip hidden indicators that have no pane', () => {
    expect(subPaneTargetIndex(ids, 'mom-2', (id) => id === 'macd-1')).toBe(2);
  });
});
