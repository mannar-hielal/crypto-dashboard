/**
 * One lightweight-charts pane per sub-pane indicator instance (owner decision A, 2026-10-03), and
 * no drawing from an indicator pane (decision J). The chart is a small in-memory fake that keeps a
 * real pane list, so addPane / removePane / moveTo and the pane indices can be checked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { IndicatorInstance } from '@/lib/indicators/types';
import { chart as chartTokens } from '@/lib/tokens';

// ─── Fake chart ──────────────────────────────────────────────────────────────

function stub(): unknown {
  const fn = () => stub();
  return new Proxy(fn, {
    get: (_t, prop) => (prop === 'then' ? undefined : stub()),
    apply: () => stub(),
  });
}

const h = vi.hoisted(() => {
  class FakePane {
    factor = 1;
    readonly list: FakePane[];
    constructor(list: FakePane[]) {
      this.list = list;
    }
    paneIndex() {
      return this.list.indexOf(this);
    }
    getStretchFactor() {
      return this.factor;
    }
    setStretchFactor(f: number) {
      this.factor = f;
    }
    moveTo(i: number) {
      const from = this.paneIndex();
      this.list.splice(from, 1);
      this.list.splice(i, 0, this);
    }
    getHTMLElement() {
      return null;
    }
  }
  return {
    FakePane,
    panes: [] as InstanceType<typeof FakePane>[],
    /** Every series added: its options, the pane object it went in, removed or not */
    series: [] as { options: Record<string, unknown>; pane: unknown; removed: boolean }[],
    removedPaneIndices: [] as number[],
    addedDrawings: [] as unknown[],
    activeTool: null as string | null,
    mainPaneHeight: 300,
  };
});

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>();
  const fakeSeries = (options: Record<string, unknown>, paneIndex: number) => {
    const record = { options, pane: h.panes[paneIndex], removed: false };
    h.series.push(record);
    const handlers = new Set<() => void>();
    const self: Record<string, unknown> = {
      __record: record,
      data: () => [],
      setData: () => undefined,
      update: () => undefined,
      applyOptions: () => undefined,
      createPriceLine: () => stub(),
      removePriceLine: () => undefined,
      priceScale: () => ({ applyOptions: () => undefined }),
      coordinateToPrice: (y: number) => 1000 - y,
      subscribeDataChanged: (fn: () => void) => handlers.add(fn),
      unsubscribeDataChanged: (fn: () => void) => handlers.delete(fn),
      attachPrimitive: (p: { attached?: (a: unknown) => void }) =>
        p.attached?.({ series: self, chart: {}, requestUpdate: () => undefined }),
      detachPrimitive: (p: { detached?: () => void }) => p.detached?.(),
    };
    return self;
  };
  const chart: Record<string, unknown> = {
    addSeries: (_def: unknown, options: Record<string, unknown>, paneIndex = 0) =>
      fakeSeries(options, paneIndex),
    removeSeries: (s: { __record: { removed: boolean } }) => {
      s.__record.removed = true;
    },
    addPane: () => {
      const pane = new h.FakePane(h.panes);
      h.panes.push(pane);
      return pane;
    },
    panes: () => [...h.panes],
    removePane: (i: number) => {
      h.removedPaneIndices.push(i);
      h.panes.splice(i, 1);
    },
    paneSize: (i = 0) => ({ width: 800, height: i === 0 ? h.mainPaneHeight : 100 }),
    timeScale: () => ({
      coordinateToTime: (x: number) => 1_700_000_000 + x,
      coordinateToLogical: () => null,
      getVisibleLogicalRange: () => null,
      getVisibleRange: () => null,
      applyOptions: () => undefined,
      scrollToPosition: () => undefined,
      setVisibleLogicalRange: () => undefined,
    }),
  };
  const chartProxy = new Proxy(chart, {
    get: (t, prop) => (prop in t ? t[prop as string] : () => stub()),
  });
  return {
    ...actual,
    createChart: () => {
      h.panes.length = 0;
      h.panes.push(new h.FakePane(h.panes));
      return chartProxy;
    },
  };
});

vi.mock('lightweight-charts-drawing', () => ({
  DrawingManager: function DrawingManager() {
    return new Proxy(
      {
        on: () => () => undefined,
        getActiveTool: () => h.activeTool,
        addDrawing: (d: unknown) => h.addedDrawings.push(d),
      } as Record<string, unknown>,
      { get: (t, prop) => (prop in t ? t[prop as string] : () => stub()) }
    );
  },
  ToolRegistry: {
    getInstance: () => ({
      get: () => ({ requiredAnchors: 1 }),
      createDrawing: (type: string, id: string) => ({ type, id }),
    }),
  },
}));

vi.mock('@/components/indicators/IndicatorLegends', () => ({
  IndicatorLegends: () => null,
}));

import { ChartPanel } from '../ChartPanel';
import { paneStores } from '@/store/paneStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inst(instanceId: string, indicatorId: string, enabled = true): IndicatorInstance {
  return {
    instanceId,
    indicatorId,
    params: {},
    color: chartTokens.ema9,
    lineWidth: 2,
    lineStyle: 'solid',
    enabled,
  };
}

function panel(indicators: IndicatorInstance[]) {
  return <ChartPanel paneIndex={0} symbol="BTCUSDT" interval="1m" indicators={indicators} />;
}

/** Live (not removed) series titles per pane, in pane order */
function seriesByPane(): string[][] {
  return h.panes.map((p) =>
    h.series.filter((s) => s.pane === p && !s.removed).map((s) => String(s.options.title ?? ''))
  );
}

beforeEach(() => {
  h.series.length = 0;
  h.removedPaneIndices.length = 0;
  h.addedDrawings.length = 0;
  h.activeTool = null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('requestAnimationFrame', () => 0);
  paneStores[0].getState().reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  paneStores[0].getState().reset();
});

// ─── Panes ───────────────────────────────────────────────────────────────────

describe('ChartPanel indicator panes', () => {
  it('[10.6.1] should give each sub-pane indicator instance its own pane, in add order', () => {
    render(
      panel([
        inst('ema', 'ema'),
        inst('mom1', 'momentum'),
        inst('mom2', 'momentum'),
        inst('macd1', 'macd'),
        inst('macd2', 'macd'),
      ])
    );
    const panes = seriesByPane();
    expect(panes).toHaveLength(5); // price + 2 Momentum + 2 MACD
    expect(panes[0]).toContain('EMA 20'); // overlays stay on the price pane
    expect(panes[1]).toEqual(['Momentum']);
    expect(panes[2]).toEqual(['Momentum']);
    expect(panes[3]).toEqual(['MACD', 'Signal', '']);
    expect(panes[4]).toEqual(['MACD', 'Signal', '']);
  });

  it('[10.6.1] should start a new pane at about 20% of the chart and keep the price pane larger', () => {
    render(panel([inst('mom1', 'momentum')]));
    const [main, sub] = h.panes;
    const share = sub.factor / (main.factor + sub.factor);
    expect(share).toBeCloseTo(0.2, 5);
  });

  it('[10.6.3] should remove the series and then the pane when an instance is removed', () => {
    const { rerender } = render(
      panel([inst('mom1', 'momentum'), inst('macd1', 'macd'), inst('mom2', 'momentum')])
    );
    expect(h.panes).toHaveLength(4);

    rerender(panel([inst('mom1', 'momentum'), inst('mom2', 'momentum')]));

    expect(h.removedPaneIndices).toEqual([2]); // MACD's pane, read when removed
    expect(seriesByPane().slice(1)).toEqual([['Momentum'], ['Momentum']]);
    expect(h.series.filter((s) => s.options.title === 'MACD').every((s) => s.removed)).toBe(true);
  });

  it('[10.6.3] should remove a pane by its current index after a pane above it went', () => {
    const { rerender } = render(panel([inst('mom1', 'momentum'), inst('mom2', 'momentum')]));
    rerender(panel([inst('mom2', 'momentum')]));
    rerender(panel([]));
    // mom1 was pane 1; mom2 moved up from 2 to 1 — removed at 1, never a stale 2
    expect(h.removedPaneIndices).toEqual([1, 1]);
    expect(h.panes).toHaveLength(1);
  });

  it('[10.6.6] should remove the pane when an instance is hidden and bring it back in place', () => {
    const { rerender } = render(
      panel([inst('mom1', 'momentum'), inst('macd1', 'macd'), inst('mom2', 'momentum')])
    );
    rerender(
      panel([inst('mom1', 'momentum', false), inst('macd1', 'macd'), inst('mom2', 'momentum')])
    );
    expect(h.panes).toHaveLength(3);
    expect(seriesByPane()[1]).toEqual(['MACD', 'Signal', '']);

    rerender(panel([inst('mom1', 'momentum'), inst('macd1', 'macd'), inst('mom2', 'momentum')]));
    expect(h.panes).toHaveLength(4);
    expect(seriesByPane().slice(1)).toEqual([['Momentum'], ['MACD', 'Signal', ''], ['Momentum']]);
  });

  it('should keep an overlay on the price pane and add no pane for it', () => {
    render(panel([inst('ema', 'ema'), inst('tp', 'typical-price')]));
    expect(h.panes).toHaveLength(1);
  });
});

// ─── Drawings stay on the price pane ─────────────────────────────────────────

describe('ChartPanel drawing tools with indicator panes', () => {
  function click(el: Element, y: number) {
    const init = { button: 0, clientX: 100, clientY: y, bubbles: true };
    el.dispatchEvent(new PointerEvent('pointerdown', init));
    el.dispatchEvent(new PointerEvent('pointerup', init));
  }

  it('[10.6.5] should place a drawing from a click in the price pane', () => {
    const { container } = render(panel([inst('mom1', 'momentum')]));
    h.activeTool = 'horizontal-line';
    const chartEl = container.querySelector('.h-full.w-full > .h-full.w-full')!;
    click(chartEl, 120);
    expect(h.addedDrawings).toHaveLength(1);
  });

  it('[10.6.5] should create no drawing from a click in an indicator pane', () => {
    const { container } = render(panel([inst('mom1', 'momentum')]));
    h.activeTool = 'horizontal-line';
    const chartEl = container.querySelector('.h-full.w-full > .h-full.w-full')!;
    click(chartEl, h.mainPaneHeight + 40); // inside Momentum's pane
    expect(h.addedDrawings).toHaveLength(0);
  });
});
