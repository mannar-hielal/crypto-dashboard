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
import { exponentialMovingAverage, simpleMovingAverage } from './moving-average-calculation';
import { chart as chartTokens } from '@/lib/tokens';

type MaFn = (values: (number | undefined)[], period: number) => (number | undefined)[];

const MA_FNS: Record<string, MaFn> = {
  ema: exponentialMovingAverage,
  sma: simpleMovingAverage,
};

const LINE_STYLE_MAP: Record<IndicatorStyle['lineStyle'], LineStyle> = {
  solid: LineStyle.Solid,
  dotted: LineStyle.Dotted,
  dashed: LineStyle.Dashed,
  'large-dashed': LineStyle.LargeDashed,
  'sparse-dotted': LineStyle.SparseDotted,
};

function getSourceValue(bar: CandlestickData<UTCTimestamp>, source: string): number {
  switch (source) {
    case 'hl2':
      return (bar.high + bar.low) / 2;
    case 'hlc3':
      return (bar.high + bar.low + bar.close) / 3;
    case 'ohlc4':
      return (bar.open + bar.high + bar.low + bar.close) / 4;
    default:
      return bar.close;
  }
}

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

  const signalColor = chartTokens.macdSignal;
  const histBullColor = chartTokens.macdHistBull;
  const histBullDimColor = chartTokens.macdHistBullDim;
  const histBearColor = chartTokens.macdHistBear;
  const histBearDimColor = chartTokens.macdHistBearDim;

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
      color: signalColor,
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
      color: histBullColor,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    paneIndex
  );

  const zeroSeries = chart.addSeries(
    LineSeries,
    {
      color: 'rgba(120, 123, 134, 0.4)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    },
    paneIndex
  );

  const allSeries: IndicatorSeries[] = [macdSeries, signalSeries, histSeries, zeroSeries];

  const api: IndicatorPrimitive = {
    getSeries() {
      return allSeries;
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
      zeroSeries.setData([]);
      return;
    }

    const fast = Number(current.fast) || 12;
    const slow = Number(current.slow) || 26;
    const signalPeriod = Number(current.signalLength) || 9;
    const sourceType = (current.source as string) ?? 'close';
    const oscMaType = (current.oscMaType as string) ?? 'ema';
    const signalMaType = (current.signalMaType as string) ?? 'ema';

    const times = data.map((d) => d.time as UTCTimestamp);
    const values = data.map((d) => getSourceValue(d, sourceType));

    const maFastFn = MA_FNS[oscMaType] ?? exponentialMovingAverage;
    const maSlowFn = MA_FNS[oscMaType] ?? exponentialMovingAverage;
    const maSignalFn = MA_FNS[signalMaType] ?? exponentialMovingAverage;

    const fastMa = maFastFn(values, fast);
    const slowMa = maSlowFn(values, slow);

    const macdVals: (number | undefined)[] = fastMa.map((f, i) =>
      f !== undefined && slowMa[i] !== undefined ? f - slowMa[i]! : undefined
    );

    const nonNullMacd = macdVals.filter((v): v is number => v !== undefined);
    const signalRaw = maSignalFn(nonNullMacd, signalPeriod);

    const signalVals: (number | undefined)[] = [];
    let idx = 0;
    for (let i = 0; i < macdVals.length; i++) {
      if (macdVals[i] !== undefined) {
        signalVals.push(signalRaw[idx++] ?? undefined);
      } else {
        signalVals.push(undefined);
      }
    }

    const histVals: (number | undefined)[] = macdVals.map((m, i) =>
      m !== undefined && signalVals[i] !== undefined ? m - signalVals[i]! : undefined
    );

    const toLine = (
      vals: (number | undefined)[]
    ): (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] =>
      times.map((time, i) =>
        typeof vals[i] === 'number' ? { time, value: vals[i] as number } : { time }
      );

    const histData: (HistogramData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] = times.map(
      (time, i) => {
        const val = histVals[i];
        if (typeof val !== 'number') return { time };
        const rising = val >= (histVals[i - 1] ?? val);
        const positive = val >= 0;
        let barColor: string;
        if (positive) {
          barColor = rising ? histBullColor : histBullDimColor;
        } else {
          barColor = rising ? histBearDimColor : histBearColor;
        }
        return { time, value: val, color: barColor };
      }
    );

    macdSeries.setData(toLine(macdVals));
    signalSeries.setData(toLine(signalVals));
    histSeries.setData(histData);

    const zeroData: (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] = times.map(
      (time) => ({ time, value: 0 })
    );
    zeroSeries.setData(zeroData);
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
