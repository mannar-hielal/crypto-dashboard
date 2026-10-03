import type { IChartApi, ISeriesApi, ISeriesPrimitive, Time } from 'lightweight-charts';

// ─── Param definitions used by settings popover ──────────────────────────────

export type ParamType = 'number' | 'select';

export interface ParamDef {
  id: string;
  label: string;
  type: ParamType;
  default: number | string;
  options?: { label: string; value: string | number }[];
  min?: number;
  max?: number;
  step?: number;
}

export type ParamValues = Record<string, number | string>;

// ─── Indicator categories ─────────────────────────────────────────────────────

export type IndicatorCategory = 'overlay' | 'sub-pane';

// ─── Primitive lifecycle ──────────────────────────────────────────────────────

export interface IndicatorStyle {
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: 'solid' | 'dotted' | 'dashed' | 'large-dashed' | 'sparse-dotted';
}

export type IndicatorSeries = ISeriesApi<'Line'> | ISeriesApi<'Histogram'>;

/**
 * An indicator primitive that wraps source-series data and emits its own series.
 */
export interface IndicatorPrimitive extends ISeriesPrimitive {
  getSeries(): IndicatorSeries[];
  /** The series whose values the legend shows, in legend order (MACD: histogram, MACD, signal) */
  legendSeries(): IndicatorSeries[];
  applyOptions(options: ParamValues): void;
  applyStyle(style: IndicatorStyle): void;
}

export type IndicatorFactory = (args: {
  chart: IChartApi;
  source: ISeriesApi<'Candlestick'>;
  params: ParamValues;
  style: IndicatorStyle;
  /**
   * The lightweight-charts pane the series go in, as the pane's index at creation time: 0 for an
   * overlay, the instance's own pane (ChartPanel creates one per sub-pane instance) otherwise.
   * Series stay in their pane when other panes are removed and the indices shift.
   */
  paneIndex: number;
}) => IndicatorPrimitive;

// ─── Catalog entry ───────────────────────────────────────────────────────────

export interface IndicatorMeta {
  id: string;
  label: string;
  /** The legend's name for it, e.g. "Mom" (owner, 2026-10-03: TradingView-style legend) */
  shortTitle: string;
  /**
   * The inputs the legend lists after the short title, e.g. MACD → [12, 26, 'close', 9, 'EMA',
   * 'EMA']. Default: every param's value, in `params` order.
   */
  legendInputs?: (params: ParamValues) => (string | number)[];
  description: string;
  category: IndicatorCategory;
  defaultParams: ParamValues;
  params: ParamDef[];
  defaultColor: string;
  defaultLineWidth: 1 | 2 | 3 | 4;
  defaultLineStyle: IndicatorStyle['lineStyle'];
  factory: IndicatorFactory;
}

// ─── Per-pane instance (persisted) ────────────────────────────────────────────

export interface IndicatorInstance {
  instanceId: string;
  indicatorId: string;
  params: ParamValues;
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: IndicatorStyle['lineStyle'];
  enabled: boolean;
}

export type { IChartApi, ISeriesApi, Time };
