/** Owner decision B (2026-10-03): Momentum, ROC and MACD panes get a dashed zero line. */

import { describe, expect, it } from 'vitest';
import { chart as chartTokens } from '@/lib/tokens';
import { getIndicatorMeta } from '../catalog';
import { candles, fakeChart, fakeSource } from './fakeChart';

const ZERO_LINE = expect.objectContaining({
  price: 0,
  color: chartTokens.zeroLine,
  lineStyle: 2, // LineStyle.Dashed
  axisLabelVisible: false,
});

function build(id: string) {
  const meta = getIndicatorMeta(id)!;
  const chart = fakeChart();
  const prim = meta.factory({
    chart: chart.api,
    source: fakeSource(candles([1, 2, 3, 4, 5])).api,
    params: { ...meta.defaultParams },
    style: { color: meta.defaultColor, lineWidth: 2, lineStyle: 'solid' },
    paneIndex: 2,
  });
  return { chart, prim };
}

describe('[10.6.9] zero lines', () => {
  it.each(['momentum', 'roc', 'macd'])('%s should get one dashed zero price line', (id) => {
    const { chart } = build(id);
    expect(chart.series.flatMap((s) => s.priceLines)).toEqual([ZERO_LINE]);
  });

  it.each(['ema', 'sma', 'typical-price', 'vwap'])('overlay %s should get none', (id) => {
    const { chart } = build(id);
    expect(chart.series.flatMap((s) => s.priceLines)).toEqual([]);
  });

  it.each(['momentum', 'roc'])('%s should go in the pane it is given', (id) => {
    const { chart, prim } = build(id);
    expect(chart.series.map((s) => s.paneIndex)).toEqual([2]);
    expect(prim.legendSeries()).toHaveLength(1);
  });
});
