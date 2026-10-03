/**
 * A minimal in-memory stand-in for the lightweight-charts surface the indicator primitives use
 * (addSeries / removeSeries / setData / applyOptions / createPriceLine / attachPrimitive), so a
 * primitive's lifecycle can be driven in jsdom without a canvas.
 */

import type {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';

export interface FakeSeries {
  options: Record<string, unknown>;
  setDataCalls: unknown[][];
  priceLines: Record<string, unknown>[];
  paneIndex: number;
  removed: boolean;
  setData(data: unknown[]): void;
  data(): unknown[];
  applyOptions(o: Record<string, unknown>): void;
  createPriceLine(o: Record<string, unknown>): Record<string, unknown>;
  priceScale(): { applyOptions(o: Record<string, unknown>): void };
}

function fakeSeries(options: Record<string, unknown>, paneIndex: number): FakeSeries {
  let current: unknown[] = [];
  const s: FakeSeries = {
    options: { ...options },
    setDataCalls: [],
    priceLines: [],
    paneIndex,
    removed: false,
    setData(data) {
      current = data;
      s.setDataCalls.push(data);
    },
    data: () => current,
    applyOptions(o) {
      Object.assign(s.options, o);
    },
    createPriceLine(o) {
      s.priceLines.push(o);
      return o;
    },
    priceScale: () => ({ applyOptions: () => undefined }),
  };
  return s;
}

export interface FakeChart {
  series: FakeSeries[];
  api: IChartApi;
}

export function fakeChart(): FakeChart {
  const series: FakeSeries[] = [];
  const api = {
    addSeries: (_def: unknown, options: Record<string, unknown>, paneIndex = 0) => {
      const s = fakeSeries(options, paneIndex);
      series.push(s);
      return s;
    },
    removeSeries: (s: FakeSeries) => {
      s.removed = true;
    },
  };
  return { series, api: api as unknown as IChartApi };
}

export interface FakeSource {
  api: ISeriesApi<'Candlestick'>;
  /** Replace the candles and fire the data-changed handlers (what setData / update do) */
  push(bars: CandlestickData<UTCTimestamp>[]): void;
}

export function fakeSource(initial: CandlestickData<UTCTimestamp>[]): FakeSource {
  let bars = initial;
  const handlers = new Set<() => void>();
  const self = {
    data: () => bars,
    subscribeDataChanged: (h: () => void) => handlers.add(h),
    unsubscribeDataChanged: (h: () => void) => handlers.delete(h),
    attachPrimitive: (p: ISeriesPrimitive<Time>) =>
      p.attached?.({
        series: self,
        chart: {},
        requestUpdate: () => undefined,
      } as never),
    detachPrimitive: (p: ISeriesPrimitive<Time>) => p.detached?.(),
  };
  return {
    api: self as unknown as ISeriesApi<'Candlestick'>,
    push(next) {
      bars = next;
      for (const h of handlers) h();
    },
  };
}

/** `n` candles whose close is `closes[i]` (open = previous close; high/low ±1) */
export function candles(closes: number[]): CandlestickData<UTCTimestamp>[] {
  return closes.map((close, i) => ({
    time: (1_700_000_000 + i * 60) as UTCTimestamp,
    open: i === 0 ? close : closes[i - 1],
    high: close + 1,
    low: close - 1,
    close,
  }));
}

/** The numeric values of a line's data (whitespace → undefined) */
export function values(data: unknown[]): (number | undefined)[] {
  return data.map((d) => (d as { value?: number }).value);
}
