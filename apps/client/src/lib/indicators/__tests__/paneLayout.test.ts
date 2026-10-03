import { describe, expect, it } from 'vitest';
import { subPaneStretchFactor, subPaneTargetIndex } from '../paneLayout';

/** The share of the chart a pane with `factor` gets next to panes summing to `others` */
const share = (factor: number, others: number) => factor / (factor + others);

describe('subPaneStretchFactor', () => {
  it('should give a new pane 20% of a tall chart', () => {
    expect(share(subPaneStretchFactor(1, 800), 1)).toBeCloseTo(0.2, 10);
  });

  it('should give it 20% next to panes the user already resized', () => {
    // price pane 2.5 + one indicator pane 0.7 (a separator drag rewrote the factors)
    expect(share(subPaneStretchFactor(3.2, 800), 3.2)).toBeCloseTo(0.2, 10);
  });

  it('should keep it at 60 px on a short chart', () => {
    // 60 / 200 = 30% > 20%
    expect(share(subPaneStretchFactor(1, 200), 1) * 200).toBeCloseTo(60, 10);
  });

  it('should never give it more than half, so the price pane stays the larger one', () => {
    expect(share(subPaneStretchFactor(1, 90), 1)).toBeCloseTo(0.5, 10);
  });

  it('should fall back to 20% before the chart has a height', () => {
    expect(share(subPaneStretchFactor(1, 0), 1)).toBeCloseTo(0.2, 10);
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
