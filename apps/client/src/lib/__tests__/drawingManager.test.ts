/**
 * Drawing persistence (lib/drawingManager.ts): one localStorage entry per symbol, capped at
 * MAX_DRAWINGS, schema-checked on load, and never throwing when storage is malformed or blocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawingManager } from 'lightweight-charts-drawing';
import {
  MAX_DRAWINGS,
  getPersistenceKey,
  loadDrawings,
  persistDrawings,
  restoreDrawings,
} from '@/lib/drawingManager';
import { T0, managerOnFakeChart } from './fakeDrawingChart';

const line = (id: string, price = 900) => ({
  id,
  kind: 'horizontal-line',
  points: [{ time: T0 + 10, price }],
  style: { color: '#2962ff', width: 2, lineStyle: 'solid' },
});

let managers: DrawingManager[] = [];

beforeEach(() => localStorage.clear());

afterEach(() => {
  for (const m of managers) m.destroy();
  managers = [];
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('loadDrawings', () => {
  it('should return the saved drawings of the symbol', () => {
    localStorage.setItem(getPersistenceKey('BTCUSDT'), JSON.stringify([line('a'), line('b')]));
    expect(loadDrawings('BTCUSDT').map((d) => d.id)).toEqual(['a', 'b']);
    expect(loadDrawings('ETHUSDT')).toEqual([]);
  });

  it('should drop malformed entries and keep the rest', () => {
    localStorage.setItem(
      getPersistenceKey('BTCUSDT'),
      JSON.stringify([line('ok'), { id: 'x' }, null, { id: 'y', kind: 'trend-line', points: 'no' }])
    );
    expect(loadDrawings('BTCUSDT').map((d) => d.id)).toEqual(['ok']);
  });

  it('should return nothing for invalid JSON', () => {
    localStorage.setItem(getPersistenceKey('BTCUSDT'), '{not json');
    expect(loadDrawings('BTCUSDT')).toEqual([]);
  });

  it('should keep the newest MAX_DRAWINGS', () => {
    const many = Array.from({ length: MAX_DRAWINGS + 5 }, (_, i) => line(`d${i}`));
    localStorage.setItem(getPersistenceKey('BTCUSDT'), JSON.stringify(many));
    const loaded = loadDrawings('BTCUSDT');
    expect(loaded).toHaveLength(MAX_DRAWINGS);
    expect(loaded[0]!.id).toBe('d5');
  });

  it('should return nothing when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadDrawings('BTCUSDT')).toEqual([]);
  });
});

describe('persistDrawings / restoreDrawings', () => {
  function setup() {
    const f = managerOnFakeChart();
    managers.push(f.manager);
    return f.manager;
  }

  it('should save a manager’s drawings under its symbol and restore them into another', () => {
    const a = setup();
    a.add(line('one') as never);
    persistDrawings(a, 'BTCUSDT');
    const b = setup();
    restoreDrawings(b, 'BTCUSDT');
    expect(b.drawings().map((d) => d.id)).toEqual(['one']);
  });

  it('should replace the drawings on restore, also with an empty set', () => {
    const m = setup();
    m.add(line('old') as never);
    restoreDrawings(m, 'SOLUSDT');
    expect(m.drawings()).toEqual([]);
  });

  it('should save at most MAX_DRAWINGS', () => {
    const m = setup();
    for (let i = 0; i < MAX_DRAWINGS + 3; i++) m.add(line(`d${i}`) as never);
    persistDrawings(m, 'BTCUSDT');
    const saved = JSON.parse(localStorage.getItem(getPersistenceKey('BTCUSDT'))!) as unknown[];
    expect(saved).toHaveLength(MAX_DRAWINGS);
  });

  it('should not throw when storage is full', () => {
    const m = setup();
    m.add(line('one') as never);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => persistDrawings(m, 'BTCUSDT')).not.toThrow();
  });
});
