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
  applyOptions(options: ParamValues): void;
  applyStyle(style: IndicatorStyle): void;
}

export type IndicatorFactory = (args: {
  chart: IChartApi;
  source: ISeriesApi<'Candlestick'>;
  params: ParamValues;
  style: IndicatorStyle;
  paneIndex: number;
}) => IndicatorPrimitive;

// ─── Catalog entry ───────────────────────────────────────────────────────────

export interface IndicatorMeta {
  id: string;
  label: string;
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
  position: { x: number; y: number };
}

export type { IChartApi, ISeriesApi, Time };
