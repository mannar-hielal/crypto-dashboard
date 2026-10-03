import type {
  IChartApi,
  ISeriesApi,
  SeriesAttachedParameter,
  SeriesOptionsMap,
  Time,
  CandlestickData,
  LineData,
  WhitespaceData,
  UTCTimestamp,
} from 'lightweight-charts';
import { LineSeries, LineStyle } from 'lightweight-charts';
import type { IndicatorPrimitive, IndicatorStyle, ParamValues } from '../types';
import { exponentialMovingAverage } from './moving-average-calculation';

const LINE_STYLE_MAP: Record<IndicatorStyle['lineStyle'], LineStyle> = {
  solid: LineStyle.Solid,
  dotted: LineStyle.Dotted,
  dashed: LineStyle.Dashed,
  'large-dashed': LineStyle.LargeDashed,
  'sparse-dotted': LineStyle.SparseDotted,
};

type SupportedData = CandlestickData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;

type CandleWithVolume = CandlestickData<UTCTimestamp> & { volume?: number };

export function createEmaPrimitive(
  chart: IChartApi,
  source: ISeriesApi<'Candlestick'>,
  params: ParamValues,
  style: IndicatorStyle,
  paneIndex: number
): IndicatorPrimitive {
  // 🔐 Copies, never the caller's objects: those are the persisted layoutStore instance — mutating
  //    them in place (the old Object.assign) changed the store behind Zustand's back. Every value is
  //    read at compute time, so a settings change applies without a remount.
  let current: ParamValues = { ...params };
  let currentStyle: IndicatorStyle = { ...style };
  const lengthOf = (p: ParamValues) => Number(p.length) || 20;
  const titleOf = (p: ParamValues) => `EMA ${lengthOf(p)}`;

  const series = chart.addSeries(
    LineSeries,
    {
      color: currentStyle.color,
      lineWidth: currentStyle.lineWidth,
      lineStyle: LINE_STYLE_MAP[currentStyle.lineStyle],
      title: titleOf(current),
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    },
    paneIndex
  );

  const api: IndicatorPrimitive = {
    getSeries() {
      return [series];
    },

    legendSeries() {
      return [series];
    },

    applyOptions(newParams: ParamValues) {
      current = { ...current, ...newParams };
      series.applyOptions({ title: titleOf(current) });
      updateData();
    },

    applyStyle(newStyle: IndicatorStyle) {
      currentStyle = { ...newStyle };
      series.applyOptions({
        color: currentStyle.color,
        lineWidth: currentStyle.lineWidth,
        lineStyle: LINE_STYLE_MAP[currentStyle.lineStyle],
      });
    },

    attached(param: SeriesAttachedParameter<Time, keyof SeriesOptionsMap>) {
      param.series.subscribeDataChanged(updateData);
      updateData();
    },

    detached() {
      source.unsubscribeDataChanged(updateData);
      chart.removeSeries(series);
    },
  };

  function updateData() {
    const data = source.data() as SupportedData[];
    if (data.length === 0) {
      series.setData([]);
      return;
    }

    const length = lengthOf(current);
    const sourceField = (current.source as string) ?? 'close';
    const values: (number | undefined)[] = data.map((d) =>
      typeof (d as CandleWithVolume)[sourceField as keyof CandleWithVolume] === 'number'
        ? ((d as CandleWithVolume)[sourceField as keyof CandleWithVolume] as number)
        : undefined
    );
    const times = data.map((d) => d.time as UTCTimestamp);
    const emaValues = exponentialMovingAverage(values, length);
    const lineData: (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] = times.map(
      (time, i) =>
        typeof emaValues[i] === 'number' ? { time, value: emaValues[i] as number } : { time }
    );
    series.setData(lineData);
  }

  source.attachPrimitive(api);
  return api;
}
