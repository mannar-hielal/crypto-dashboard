/**
 * What an indicator's legend row says (owner, 2026-10-03: TradingView-style header row). Pure, so
 * the format and the value lookup are unit-tested without a chart.
 */

import type { IndicatorMeta, IndicatorSeries, ParamValues } from './types';

/** `Mom 10 close`, `ROC 9 close`, `MACD 12 26 close 9 EMA EMA`, `Typical Price` */
export function legendTitle(meta: IndicatorMeta, params: ParamValues): string {
  const inputs = meta.legendInputs
    ? meta.legendInputs(params)
    : meta.params.map((p) => params[p.id] ?? p.default);
  return [meta.shortTitle, ...inputs].join(' ');
}

export interface LegendValue {
  /** Formatted, or '—' when the series has no value at that bar (still warming up) */
  text: string;
  color: string;
}

/** Series data items as the chart reports them (`MouseEventParams.seriesData`) */
export type SeriesDataAt = ReadonlyMap<unknown, unknown>;

interface ValuedItem {
  value?: number;
  color?: string;
}

function seriesColor(series: IndicatorSeries): string {
  return (series.options() as { color?: string }).color ?? '';
}

/** The newest bar that has a value (indicator series end in whitespace while they warm up) */
function lastValued(series: IndicatorSeries): ValuedItem | undefined {
  const data = series.data();
  for (let i = data.length - 1; i >= 0; i--) {
    const item = data[i] as ValuedItem;
    if (typeof item.value === 'number') return item;
  }
  return undefined;
}

/**
 * One value per legend series, in the series' colour (a histogram bar in its own bar colour).
 * `atCrosshair` is the crosshair's series data when the mouse is over a bar; without it — mouse
 * off the chart, or past the last bar — the last bar's values are shown.
 */
export function legendValues(
  series: IndicatorSeries[],
  atCrosshair: SeriesDataAt | null
): LegendValue[] {
  return series.map((s) => {
    const item = atCrosshair ? (atCrosshair.get(s) as ValuedItem | undefined) : lastValued(s);
    const value = item?.value;
    return {
      text: typeof value === 'number' ? formatLegendValue(value) : '—',
      color: item?.color ?? seriesColor(s),
    };
  });
}

/** Two decimals, more below 1 so a small oscillator value doesn't read as 0.00 */
export function formatLegendValue(value: number): string {
  const abs = Math.abs(value);
  const digits = abs !== 0 && abs < 1 ? 4 : 2;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
