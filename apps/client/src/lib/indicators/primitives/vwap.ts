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

const LINE_STYLE_MAP: Record<IndicatorStyle['lineStyle'], LineStyle> = {
  solid: LineStyle.Solid,
  dotted: LineStyle.Dotted,
  dashed: LineStyle.Dashed,
  'large-dashed': LineStyle.LargeDashed,
  'sparse-dotted': LineStyle.SparseDotted,
};

type CandleWithVolume = CandlestickData<UTCTimestamp> & { volume?: number };

type VwapSource = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4';
type AnchorPeriod = 'session' | 'week' | 'month' | 'year';

function sourcePrice(bar: CandleWithVolume, source: VwapSource): number {
  switch (source) {
    case 'open':
      return bar.open;
    case 'high':
      return bar.high;
    case 'low':
      return bar.low;
    case 'close':
      return bar.close;
    case 'hl2':
      return (bar.high + bar.low) / 2;
    case 'ohlc4':
      return (bar.open + bar.high + bar.low + bar.close) / 4;
    case 'hlc3':
    default:
      return (bar.high + bar.low + bar.close) / 3;
  }
}

function anchorKey(time: number, anchor: AnchorPeriod): number {
  switch (anchor) {
    case 'week':
      // 1970-01-01 was a Thursday; +3 days snaps group boundaries to Mondays.
      return Math.floor((time + 3 * 86400) / (7 * 86400));
    case 'month': {
      const d = new Date(time * 1000);
      return d.getUTCFullYear() * 12 + d.getUTCMonth();
    }
    case 'year':
      return new Date(time * 1000).getUTCFullYear();
    case 'session':
    default:
      return Math.floor(time / 86400);
  }
}

export function createVwapPrimitive(
  chart: IChartApi,
  source: ISeriesApi<'Candlestick'>,
  params: ParamValues,
  style: IndicatorStyle,
  paneIndex: number
): IndicatorPrimitive {
  const series = chart.addSeries(
    LineSeries,
    {
      color: style.color,
      lineWidth: style.lineWidth,
      lineStyle: LINE_STYLE_MAP[style.lineStyle],
      title: 'VWAP',
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
    const data = source.data() as CandleWithVolume[];
    if (data.length === 0) {
      series.setData([]);
      return;
    }

    const vwapSource = (params.source as VwapSource) ?? 'hlc3';
    const anchor = (params.anchor as AnchorPeriod) ?? 'session';

    const result: (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] = [];
    let cumPV = 0;
    let cumVol = 0;
    let currentAnchor = -1;

    for (const bar of data) {
      const key = anchorKey(bar.time as number, anchor);

      if (key !== currentAnchor) {
        cumPV = 0;
        cumVol = 0;
        currentAnchor = key;
      }

      const vol = bar.volume;
      if (!vol || vol <= 0) {
        result.push({ time: bar.time });
        continue;
      }

      const price = sourcePrice(bar, vwapSource);
      cumPV += price * vol;
      cumVol += vol;
      result.push({ time: bar.time, value: cumPV / cumVol });
    }

    series.setData(result);
  }

  source.attachPrimitive(api);
  return api;
}
