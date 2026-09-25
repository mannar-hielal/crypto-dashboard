import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

// Regression: the right price scale used to be forced to autoScale:false and
// only pulsed on for one rAF after a data load. A flat frame (WS cold-aggregator
// snapshot or the flat padding series) froze the axis to a ~0.1 USDT window,
// so every candle rendered as a full-height vertical bar until page reload.

// Auto-stub: any property access returns a callable stub that returns another
// stub, so ChartPanel's wide lightweight-charts API surface needs no hand mocks.
function stub(): unknown {
  const fn = () => stub();
  return new Proxy(fn, {
    get: (_t, prop) => (prop === 'then' ? undefined : stub()),
    apply: () => stub(),
  });
}

const h = vi.hoisted(() => ({
  createChartOptions: [] as Record<string, unknown>[],
  seriesOptions: [] as Record<string, unknown>[],
  priceScaleOptions: [] as Record<string, unknown>[],
  timeScaleCalls: [] as { method: string; args: unknown[] }[],
  drawingHandlers: new Map<string, ((e: { drawing?: object }) => void)[]>(),
  // Calls on each series, in addSeries order (0 = candles, 1 = padding).
  seriesCalls: [] as { method: string; args: unknown[] }[][],
}));

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>();
  const chart = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'addSeries')
          return (_type: unknown, opts: Record<string, unknown>) => {
            h.seriesOptions.push(opts);
            const calls: { method: string; args: unknown[] }[] = [];
            h.seriesCalls.push(calls);
            return new Proxy(
              {},
              {
                get: (_s, method) =>
                  method === 'then'
                    ? undefined
                    : (...args: unknown[]) => {
                        calls.push({ method: String(method), args });
                        return stub();
                      },
              }
            );
          };
        if (prop === 'priceScale')
          return () => ({
            applyOptions: (o: Record<string, unknown>) => h.priceScaleOptions.push(o),
          });
        if (prop === 'timeScale')
          return () =>
            new Proxy(
              {},
              {
                get: (_t2, p) =>
                  p === 'getVisibleRange' || p === 'getVisibleLogicalRange'
                    ? () => null
                    : (...args: unknown[]) => {
                        h.timeScaleCalls.push({ method: String(p), args });
                      },
              }
            );
        return () => stub();
      },
    }
  );
  return {
    ...actual,
    createChart: (_el: unknown, opts: Record<string, unknown>) => {
      h.createChartOptions.push(opts);
      return chart;
    },
  };
});

vi.mock('lightweight-charts-drawing', () => ({
  // A regular function (not a class) so `new` may return the proxy.
  DrawingManager: function DrawingManager() {
    return new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === 'on'
            ? (event: string, cb: (e: { drawing?: object }) => void) => {
                h.drawingHandlers.set(event, [...(h.drawingHandlers.get(event) ?? []), cb]);
                return () => undefined;
              }
            : stub(),
      }
    );
  },
  ToolRegistry: stub(),
}));

vi.mock('@/components/indicators/IndicatorWidgets', () => ({
  IndicatorWidgets: () => null,
}));

import type { CandleBar } from '@crypto-dashboard/sdk';
import { ChartPanel } from '../ChartPanel';
import { paneStores } from '@/store/paneStore';

function bar(i: number, price: number): CandleBar {
  return {
    timestamp: 1_790_000_000_000 + i * 60_000,
    open: price,
    high: price + 50,
    low: price - 50,
    close: price,
    volume: 1,
    quoteAssetVolume: price,
  };
}

describe('ChartPanel price scale autoscale', () => {
  const rafCallbacks: FrameRequestCallback[] = [];

  beforeEach(() => {
    h.createChartOptions.length = 0;
    h.seriesOptions.length = 0;
    h.priceScaleOptions.length = 0;
    h.timeScaleCalls.length = 0;
    h.drawingHandlers.clear();
    h.seriesCalls.length = 0;
    rafCallbacks.length = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    paneStores[0].getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    paneStores[0].getState().reset();
  });

  it('does not disable autoscale on the right price scale at creation', () => {
    render(<ChartPanel paneIndex={0} symbol="BTCUSDT" interval="1m" indicators={[]} />);
    const opts = h.createChartOptions[0] as { rightPriceScale?: { autoScale?: boolean } };
    expect(opts.rightPriceScale?.autoScale).not.toBe(false);
  });

  it('excludes the invisible padding series from autoscale', () => {
    render(<ChartPanel paneIndex={0} symbol="BTCUSDT" interval="1m" indicators={[]} />);
    const padding = h.seriesOptions.find((o) => o.color === 'transparent');
    expect(padding).toBeDefined();
    const provider = padding?.autoscaleInfoProvider as (() => unknown) | undefined;
    expect(typeof provider).toBe('function');
    expect(provider?.()).toBeNull();
  });

  it('never re-disables autoscale after a data load (no one-frame pulse)', () => {
    render(<ChartPanel paneIndex={0} symbol="BTCUSDT" interval="1m" indicators={[]} />);
    act(() => {
      paneStores[0].getState().setSnapshot(
        Array.from({ length: 50 }, (_, i) => bar(i, 84_000 + i)),
        null
      );
    });
    act(() => {
      for (const cb of rafCallbacks.splice(0)) cb(0);
    });
    expect(h.priceScaleOptions).toContainEqual({ autoScale: true });
    expect(h.priceScaleOptions).not.toContainEqual({ autoScale: false });
  });
  it('anchors the newest candle near the right edge, not the end of the padding', () => {
    // scrollToRealTime() scrolls to the last PADDING bar, 200 bars past the
    // newest candle — in a narrow pane that showed zero candles.
    render(<ChartPanel paneIndex={0} symbol="BTCUSDT" interval="1h" indicators={[]} />);
    act(() => {
      paneStores[0].getState().setSnapshot(
        Array.from({ length: 50 }, (_, i) => bar(i, 84_000 + i)),
        null
      );
    });
    const methods = h.timeScaleCalls.map((c) => c.method);
    expect(methods).not.toContain('scrollToRealTime');
    const scroll = h.timeScaleCalls.find((c) => c.method === 'scrollToPosition');
    expect(scroll).toBeDefined();
    // Negative position = scrolled left of the time scale's end (the padding).
    expect(scroll?.args[0]).toBeLessThan(-100);
  });

  it('opts every drawing out of autoscale, including restored ones', () => {
    render(<ChartPanel paneIndex={0} symbol="BTCUSDT" interval="1m" indicators={[]} />);
    const handlers = h.drawingHandlers.get('drawing:added') ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    const drawing = {
      autoscaleInfo: () => ({ priceRange: { minValue: 1, maxValue: 1_000_000 } }),
    };
    for (const cb of handlers) cb({ drawing });
    expect(drawing.autoscaleInfo()).toBeNull();
  });

  it('draws Heikin Ashi values and keeps the real last price visible', () => {
    // Display-only: the candle series gets HA bars, but its own last-value
    // label (which would show the HA close) is replaced by a price line at the
    // REAL last close.
    render(
      <ChartPanel
        paneIndex={0}
        symbol="BTCUSDT"
        interval="1m"
        indicators={[]}
        chartType="heikinAshi"
      />
    );
    const bars = Array.from({ length: 30 }, (_, i) => bar(i, 84_000 + i * 10));
    act(() => {
      paneStores[0].getState().setSnapshot(bars, null);
    });
    const candleCalls = h.seriesCalls[0];
    const setData = candleCalls.filter((c) => c.method === 'setData').pop();
    const pushed = setData?.args[0] as { open: number; close: number }[];
    const last = bars[bars.length - 1];
    // HA close = (o + h + l + c) / 4
    expect(pushed[pushed.length - 1].close).toBe(
      (last.open + last.high + last.low + last.close) / 4
    );
    expect(candleCalls).toContainEqual({
      method: 'applyOptions',
      args: [{ lastValueVisible: false, priceLineVisible: false }],
    });
    const priceLine = candleCalls.find((c) => c.method === 'createPriceLine');
    expect((priceLine?.args[0] as { price: number }).price).toBe(last.close);
  });

  it('draws real candles by default', () => {
    render(<ChartPanel paneIndex={0} symbol="BTCUSDT" interval="1m" indicators={[]} />);
    const bars = Array.from({ length: 30 }, (_, i) => bar(i, 84_000 + i * 10));
    act(() => {
      paneStores[0].getState().setSnapshot(bars, null);
    });
    const candleCalls = h.seriesCalls[0];
    const pushed = candleCalls.filter((c) => c.method === 'setData').pop()?.args[0] as {
      close: number;
    }[];
    expect(pushed[pushed.length - 1].close).toBe(bars[bars.length - 1].close);
    expect(candleCalls.some((c) => c.method === 'createPriceLine')).toBe(false);
  });
});
