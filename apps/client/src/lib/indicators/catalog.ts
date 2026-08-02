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
import type {
  IndicatorMeta,
  ParamValues,
  IndicatorStyle,
  IndicatorPrimitive,
  IndicatorSeries,
} from './types';
import { chart as chartTokens } from '@/lib/tokens';
import { createEmaPrimitive } from './primitives/ema';
import { createVwapPrimitive } from './primitives/vwap';
import { createMacdPrimitive } from './primitives/macd';
import { calculateMovingAverageIndicatorValues } from './primitives/moving-average-calculation';
import { calculateAveragePriceIndicatorValues } from './primitives/average-price-calculation';
import { calculateMedianPriceIndicatorValues } from './primitives/median-price-calculation';
import { calculateWeightedCloseIndicatorValues } from './primitives/weighted-close-calculation';
import { calculateMomentumIndicatorValues } from './primitives/momentum-calculation';
import { calculatePercentChangeIndicatorValues } from './primitives/percent-change-calculation';

type SupportedData = CandlestickData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;

const LINE_STYLE_MAP: Record<IndicatorStyle['lineStyle'], LineStyle> = {
  solid: LineStyle.Solid,
  dotted: LineStyle.Dotted,
  dashed: LineStyle.Dashed,
  'large-dashed': LineStyle.LargeDashed,
  'sparse-dotted': LineStyle.SparseDotted,
};

function createGenericPrimitive(
  chart: IChartApi,
  source: ISeriesApi<'Candlestick'>,
  options: {
    title: string;
    color: string;
    lineWidth: 1 | 2 | 3 | 4;
    lineStyle: IndicatorStyle['lineStyle'];
    calc: (
      data: SupportedData[],
      params: ParamValues
    ) => (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[];
    params: ParamValues;
    paneIndex: number;
  }
): IndicatorPrimitive {
  const series = chart.addSeries(
    LineSeries,
    {
      color: options.color,
      lineWidth: options.lineWidth,
      lineStyle: LINE_STYLE_MAP[options.lineStyle],
      title: options.title,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    },
    options.paneIndex
  );

  let currentParams = { ...options.params };

  const primitive: IndicatorPrimitive = {
    getSeries() {
      return [series] as IndicatorSeries[];
    },

    applyOptions(newParams: ParamValues) {
      currentParams = { ...currentParams, ...newParams };
      updateData();
    },

    applyStyle(style: IndicatorStyle) {
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
    const values = options.calc(data, currentParams);
    series.setData(values);
  }

  source.attachPrimitive(primitive);
  return primitive;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const DEFAULT_LINE_COLORS = [
  '#94a3b8',
  '#3b82f6',
  '#9c27b0',
  '#f97316',
  '#22c55e',
  '#eab308',
  '#ec4899',
  '#06b6d4',
  '#a855f7',
];

let colorIndex = 0;
function nextColor(): string {
  return DEFAULT_LINE_COLORS[colorIndex++ % DEFAULT_LINE_COLORS.length];
}

export const INDICATOR_CATALOG: IndicatorMeta[] = [
  {
    id: 'ema',
    label: 'EMA',
    description: 'Exponential Moving Average — places more weight on recent prices',
    category: 'overlay',
    defaultParams: { length: 20, source: 'close' },
    params: [
      { id: 'length', label: 'Length', type: 'number', default: 20, min: 1, max: 500, step: 1 },
      {
        id: 'source',
        label: 'Source',
        type: 'select',
        default: 'close',
        options: [
          { label: 'Close', value: 'close' },
          { label: 'Open', value: 'open' },
          { label: 'High', value: 'high' },
          { label: 'Low', value: 'low' },
        ],
      },
    ],
    defaultColor: nextColor(),
    defaultLineWidth: 2,
    defaultLineStyle: 'solid',
    factory: ({ chart, source, params, style, paneIndex }) =>
      createEmaPrimitive(chart, source, params, style, paneIndex),
  },

  {
    id: 'sma',
    label: 'SMA',
    description: 'Simple Moving Average — arithmetic mean over a period',
    category: 'overlay',
    defaultParams: { length: 20, source: 'close' },
    params: [
      { id: 'length', label: 'Length', type: 'number', default: 20, min: 1, max: 500, step: 1 },
      {
        id: 'source',
        label: 'Source',
        type: 'select',
        default: 'close',
        options: [
          { label: 'Close', value: 'close' },
          { label: 'Open', value: 'open' },
          { label: 'High', value: 'high' },
          { label: 'Low', value: 'low' },
        ],
      },
    ],
    defaultColor: nextColor(),
    defaultLineWidth: 2,
    defaultLineStyle: 'solid',
    factory: ({ chart, source, params, style, paneIndex }) =>
      createGenericPrimitive(chart, source, {
        title: `SMA ${params.length}`,
        color: style.color,
        lineWidth: style.lineWidth,
        lineStyle: style.lineStyle,
        params,
        paneIndex,
        calc: (data) =>
          calculateMovingAverageIndicatorValues(data, {
            length: (params.length as number) ?? 20,
            source: (params.source as string) ?? 'close',
            smoothingLine: undefined,
          }),
      }),
  },

  {
    id: 'average-price',
    label: 'Average Price',
    description: 'Average of OHLC/4 for each bar',
    category: 'overlay',
    defaultParams: {},
    params: [],
    defaultColor: nextColor(),
    defaultLineWidth: 2,
    defaultLineStyle: 'solid',
    factory: ({ chart, source, params, style, paneIndex }) =>
      createGenericPrimitive(chart, source, {
        title: 'Avg Price',
        color: style.color,
        lineWidth: style.lineWidth,
        lineStyle: style.lineStyle,
        params,
        paneIndex,
        calc: (data) => calculateAveragePriceIndicatorValues(data, { offset: 0 }),
      }),
  },

  {
    id: 'median-price',
    label: 'Median Price',
    description: '(High + Low) / 2 for each bar',
    category: 'overlay',
    defaultParams: {},
    params: [],
    defaultColor: nextColor(),
    defaultLineWidth: 2,
    defaultLineStyle: 'solid',
    factory: ({ chart, source, params, style, paneIndex }) =>
      createGenericPrimitive(chart, source, {
        title: 'Median Price',
        color: style.color,
        lineWidth: style.lineWidth,
        lineStyle: style.lineStyle,
        params,
        paneIndex,
        calc: (data) => calculateMedianPriceIndicatorValues(data, { offset: 0 }),
      }),
  },

  {
    id: 'weighted-close',
    label: 'Weighted Close',
    description: '(Close×2 + High + Low) / 4 for each bar',
    category: 'overlay',
    defaultParams: {},
    params: [],
    defaultColor: nextColor(),
    defaultLineWidth: 2,
    defaultLineStyle: 'solid',
    factory: ({ chart, source, params, style, paneIndex }) =>
      createGenericPrimitive(chart, source, {
        title: 'Weighted Close',
        color: style.color,
        lineWidth: style.lineWidth,
        lineStyle: style.lineStyle,
        params,
        paneIndex,
        calc: (data) => calculateWeightedCloseIndicatorValues(data, { offset: 0 }),
      }),
  },

  {
    id: 'vwap',
    label: 'VWAP',
    description: 'Volume-Weighted Average Price — anchored to a session/period',
    category: 'overlay',
    defaultParams: { source: 'hlc3', anchor: 'session' },
    params: [
      {
        id: 'source',
        label: 'Source',
        type: 'select',
        default: 'hlc3',
        options: [
          { label: 'Open', value: 'open' },
          { label: 'High', value: 'high' },
          { label: 'Low', value: 'low' },
          { label: 'Close', value: 'close' },
          { label: '(H+L)/2', value: 'hl2' },
          { label: '(H+L+C)/3', value: 'hlc3' },
          { label: '(O+H+L+C)/4', value: 'ohlc4' },
        ],
      },
      {
        id: 'anchor',
        label: 'Anchor Period',
        type: 'select',
        default: 'session',
        options: [
          { label: 'Session', value: 'session' },
          { label: 'Week', value: 'week' },
          { label: 'Month', value: 'month' },
          { label: 'Year', value: 'year' },
        ],
      },
    ],
    defaultColor: nextColor(),
    defaultLineWidth: 2,
    defaultLineStyle: 'solid',
    factory: ({ chart, source, params, style, paneIndex }) =>
      createVwapPrimitive(chart, source, params, style, paneIndex),
  },

  {
    id: 'momentum',
    label: 'Momentum',
    description: 'Price difference over N periods — current − previous',
    category: 'sub-pane',
    defaultParams: { length: 10, source: 'close' },
    params: [
      { id: 'length', label: 'Length', type: 'number', default: 10, min: 1, max: 200, step: 1 },
      {
        id: 'source',
        label: 'Source',
        type: 'select',
        default: 'close',
        options: [
          { label: 'Close', value: 'close' },
          { label: 'Open', value: 'open' },
          { label: 'High', value: 'high' },
          { label: 'Low', value: 'low' },
        ],
      },
    ],
    defaultColor: nextColor(),
    defaultLineWidth: 2,
    defaultLineStyle: 'solid',
    factory: ({ chart, source, params, style, paneIndex }) =>
      createGenericPrimitive(chart, source, {
        title: 'Momentum',
        color: style.color,
        lineWidth: style.lineWidth,
        lineStyle: style.lineStyle,
        params,
        paneIndex,
        calc: (data) =>
          calculateMomentumIndicatorValues(data, {
            length: (params.length as number) ?? 10,
            source: (params.source as string) ?? 'close',
          }),
      }),
  },

  {
    id: 'percent-change',
    label: 'Percent Change',
    description: 'Percentage price change between consecutive bars',
    category: 'sub-pane',
    defaultParams: {},
    params: [
      { id: 'offset', label: 'Offset', type: 'number', default: 0, min: -50, max: 50, step: 1 },
    ],
    defaultColor: nextColor(),
    defaultLineWidth: 2,
    defaultLineStyle: 'solid',
    factory: ({ chart, source, params, style, paneIndex }) =>
      createGenericPrimitive(chart, source, {
        title: 'Pct Chg',
        color: style.color,
        lineWidth: style.lineWidth,
        lineStyle: style.lineStyle,
        params,
        paneIndex,
        calc: (data) =>
          calculatePercentChangeIndicatorValues(data, {
            offset: (params.offset as number) ?? 0,
          }),
      }),
  },

  {
    id: 'macd',
    label: 'MACD',
    description: 'Moving Average Convergence Divergence — trend-following momentum indicator',
    category: 'sub-pane',
    defaultParams: {
      fast: 12,
      slow: 26,
      signalLength: 9,
      source: 'close',
      oscMaType: 'ema',
      signalMaType: 'ema',
    },
    params: [
      { id: 'fast', label: 'Fast length', type: 'number', default: 12, min: 1, max: 200, step: 1 },
      { id: 'slow', label: 'Slow length', type: 'number', default: 26, min: 1, max: 200, step: 1 },
      {
        id: 'signalLength',
        label: 'Signal length',
        type: 'number',
        default: 9,
        min: 1,
        max: 100,
        step: 1,
      },
      {
        id: 'source',
        label: 'Source',
        type: 'select',
        default: 'close',
        options: [
          { label: 'Close', value: 'close' },
          { label: 'HL2', value: 'hl2' },
          { label: 'HLC3', value: 'hlc3' },
          { label: 'OHLC4', value: 'ohlc4' },
        ],
      },
      {
        id: 'oscMaType',
        label: 'Oscillator MA type',
        type: 'select',
        default: 'ema',
        options: [
          { label: 'EMA', value: 'ema' },
          { label: 'SMA', value: 'sma' },
        ],
      },
      {
        id: 'signalMaType',
        label: 'Signal MA type',
        type: 'select',
        default: 'ema',
        options: [
          { label: 'EMA', value: 'ema' },
          { label: 'SMA', value: 'sma' },
        ],
      },
    ],
    defaultColor: chartTokens.macdLine,
    defaultLineWidth: 2,
    defaultLineStyle: 'solid',
    factory: ({ chart, source, params, style, paneIndex }) =>
      createMacdPrimitive(chart, source, params, style, paneIndex),
  },
];

/** Look up an indicator meta by id */
export function getIndicatorMeta(id: string): IndicatorMeta | undefined {
  return INDICATOR_CATALOG.find((m) => m.id === id);
}

/** Create default indicators for a fresh pane */
export function createDefaultIndicatorInstances(): {
  instanceId: string;
  indicatorId: string;
  params: Record<string, number | string>;
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: 'solid' | 'dotted' | 'dashed' | 'large-dashed' | 'sparse-dotted';
  enabled: boolean;
  position: { x: number; y: number };
}[] {
  const defaults: {
    indicatorId: string;
    params: Record<string, number | string>;
    color: string;
  }[] = [
    { indicatorId: 'ema', params: { length: 9, source: 'close' }, color: chartTokens.ema9 },
    { indicatorId: 'ema', params: { length: 20, source: 'close' }, color: chartTokens.ema20 },
    { indicatorId: 'ema', params: { length: 200, source: 'close' }, color: chartTokens.ema200 },
    { indicatorId: 'vwap', params: {}, color: chartTokens.vwap },
  ];

  return defaults.map((d, i) => ({
    instanceId: `${d.indicatorId}_${Date.now()}_${i}`,
    indicatorId: d.indicatorId,
    params: d.params,
    color: d.color,
    lineWidth: 2 as const,
    lineStyle: 'solid' as const,
    enabled: true,
    position: { x: 8, y: 40 + i * 60 },
  }));
}
