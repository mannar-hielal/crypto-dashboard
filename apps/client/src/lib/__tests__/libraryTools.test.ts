/**
 * The drawing-tool menu (lib/libraryTools.ts): TradingView's group and tool order.
 */

import { describe, expect, it } from 'vitest';
import { TOOL_GROUPS } from '@/lib/libraryTools';

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
