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
  const length = (params.length as number) ?? 20;
  const sourceField = (params.source as string) ?? 'close';

  const series = chart.addSeries(
    LineSeries,
    {
      color: style.color,
      lineWidth: style.lineWidth,
      lineStyle: LINE_STYLE_MAP[style.lineStyle],
      title: `EMA ${length}`,
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

    applyOptions(newParams: ParamValues) {
      Object.assign(params, newParams);
      updateData();
    },

    applyStyle(newStyle: IndicatorStyle) {
      Object.assign(style, newStyle);
      series.applyOptions({
        color: style.color,
        lineWidth: style.lineWidth,
        lineStyle: LINE_STYLE_MAP[style.lineStyle],
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
