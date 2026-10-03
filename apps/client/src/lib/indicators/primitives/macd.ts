import type {
  IChartApi,
  ISeriesApi,
  SeriesAttachedParameter,
  SeriesOptionsMap,
  Time,
  CandlestickData,
  LineData,
  WhitespaceData,
  HistogramData,
  UTCTimestamp,
} from 'lightweight-charts';
import { LineSeries, HistogramSeries, LineStyle } from 'lightweight-charts';
import type { IndicatorPrimitive, IndicatorStyle, ParamValues, IndicatorSeries } from '../types';
import { chart as chartTokens } from '@/lib/tokens';
import { calculateMacd, macdHistogramColor } from './macd-calculation';
import { addZeroLine } from './zeroLine';

const LINE_STYLE_MAP: Record<IndicatorStyle['lineStyle'], LineStyle> = {
  solid: LineStyle.Solid,
  dotted: LineStyle.Dotted,
  dashed: LineStyle.Dashed,
  'large-dashed': LineStyle.LargeDashed,
  'sparse-dotted': LineStyle.SparseDotted,
};

export function createMacdPrimitive(
  chart: IChartApi,
  source: ISeriesApi<'Candlestick'>,
  params: ParamValues,
  style: IndicatorStyle,
  paneIndex: number
): IndicatorPrimitive {
  // 🔐 Copies, never the caller's objects (the persisted layoutStore instance); every input is read
  //    at compute time so a settings change applies without a remount.
  let current: ParamValues = { ...params };
  let currentStyle: IndicatorStyle = { ...style };

  const macdSeries = chart.addSeries(
    LineSeries,
    {
      color: currentStyle.color,
      lineWidth: currentStyle.lineWidth,
      lineStyle: LINE_STYLE_MAP[currentStyle.lineStyle],
      title: 'MACD',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    },
    paneIndex
  );

  const signalSeries = chart.addSeries(
    LineSeries,
    {
      color: chartTokens.macdSignal,
      lineWidth: 2,
      title: 'Signal',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    },
    paneIndex
  );

  const histSeries = chart.addSeries(
    HistogramSeries,
    {
      color: chartTokens.macdHistBull,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    paneIndex
  );

  // A price line, not a series: it shapes neither the autoscale nor the crosshair (owner,
  // 2026-10-03 — the old full-length zero LineSeries did both)
  addZeroLine(macdSeries);

  const allSeries: IndicatorSeries[] = [macdSeries, signalSeries, histSeries];

  const api: IndicatorPrimitive = {
    getSeries() {
      return allSeries;
    },

    legendSeries() {
      // TradingView's order: histogram, MACD, signal
      return [histSeries, macdSeries, signalSeries];
    },

    applyOptions(newParams: ParamValues) {
      current = { ...current, ...newParams };
      updateData();
    },

    applyStyle(newStyle: IndicatorStyle) {
      currentStyle = { ...newStyle };
      macdSeries.applyOptions({
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
      for (const s of allSeries) {
        chart.removeSeries(s);
      }
    },
  };

  function updateData() {
    const data = source.data() as CandlestickData<UTCTimestamp>[];
    if (data.length === 0) {
      macdSeries.setData([]);
      signalSeries.setData([]);
      histSeries.setData([]);
      return;
    }

    const { macd, signal, histogram } = calculateMacd(data, {
      fast: Number(current.fast) || 12,
      slow: Number(current.slow) || 26,
      signalLength: Number(current.signalLength) || 9,
      source: (current.source as string) ?? 'close',
      oscMaType: (current.oscMaType as string) ?? 'ema',
      signalMaType: (current.signalMaType as string) ?? 'ema',
    });

    const times = data.map((d) => d.time as UTCTimestamp);
    const toLine = (
      vals: (number | undefined)[]
    ): (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] =>
      times.map((time, i) => {
        const v = vals[i];
        return v === undefined ? { time } : { time, value: v };
      });

    const histData: (HistogramData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] = times.map(
      (time, i) => {
        const val = histogram[i];
        if (val === undefined) return { time };
        return { time, value: val, color: macdHistogramColor(histogram[i - 1], val) };
      }
    );

    macdSeries.setData(toLine(macd));
    signalSeries.setData(toLine(signal));
    histSeries.setData(histData);
    pulsePaneAutoscale(data.length);
  }

  let lastPulsedLength = 0;
  function pulsePaneAutoscale(dataLength: number) {
    // lightweight-charts won't re-fit a sub-pane price scale that was created
    // before the source had data (e.g. persisted reload loads 0 → N bars).
    // Re-enable autoscale each time the dataset size changes so the scale
    // tracks the newly arrived bars instead of staying stuck on a degenerate
    // range. 🔐 Never switch it back off in a rAF: that froze whatever single
    // frame it computed (same bug as the main candle pane — see ChartPanel).
    if (dataLength === lastPulsedLength) return;
    lastPulsedLength = dataLength;
    macdSeries.priceScale().applyOptions({ autoScale: true });
  }

  source.attachPrimitive(api);
  return api;
}
