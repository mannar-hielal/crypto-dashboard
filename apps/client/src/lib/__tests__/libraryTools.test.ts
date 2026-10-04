/**
 * The drawing-tool menu (lib/libraryTools.ts): TradingView's group and tool order.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { TOOL_GROUPS, defaultSubTools, loadSubTools, saveSubTools } from '@/lib/libraryTools';

afterEach(() => localStorage.clear());

describe('TOOL_GROUPS', () => {
  it('should follow TradingView’s group order, Forecast & Measure before Shapes', () => {
    expect(TOOL_GROUPS.map((g) => g.id)).toEqual([
      'trend-lines',
      'fib-gann',
      'measure',
      'shapes',
      'annotations',
    ]);
  });

  it('should order Gann as TradingView: Box, Square Fixed, Square, Fan', () => {
    const gann = TOOL_GROUPS.find((g) => g.id === 'fib-gann')!.categories.find(
      (c) => c.label === 'Gann'
    )!;
    expect(gann.tools.map((t) => t.id)).toEqual([
      'gann-box',
      'gann-square-fixed',
      'gann-square',
      'gann-fan',
    ]);
  });
});

describe('the last tool of each group', () => {
  it('should start on each group’s first tool and remember a pick', () => {
    expect(loadSubTools()).toEqual(defaultSubTools());
    expect(loadSubTools()['trend-lines']).toBe('trend-line');
    saveSubTools({ ...defaultSubTools(), 'fib-gann': 'gann-fan' });
    expect(loadSubTools()['fib-gann']).toBe('gann-fan');
  });

  it('should drop saved entries that name an unknown group or a tool outside its group', () => {
    localStorage.setItem(
      'cd-drawing-subtools',
      JSON.stringify({ 'trend-lines': 'rectangle', shapes: 42, nope: 'ray', measure: 'date-range' })
    );
    const map = loadSubTools();
    expect(map['trend-lines']).toBe('trend-line');
    expect(map.shapes).toBe(defaultSubTools().shapes);
    expect(map.measure).toBe('date-range');
    expect('nope' in map).toBe(false);
    localStorage.setItem('cd-drawing-subtools', '[');
    expect(loadSubTools()).toEqual(defaultSubTools());
  });
});
