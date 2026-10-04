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
    mainPaneHeight: 300,
    timeScaleHeight: 0,
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
      height: () => h.timeScaleHeight, // 0 by default: pane area = the container's 500 px
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

// The drawing library's own rules (price pane only, placement) are tested on a fake chart in
// lib/__tests__/drawingLibrary.test.ts — here it is a stub
vi.mock('lightweight-charts-drawing', () => ({
  DrawingManager: function DrawingManager() {
    return new Proxy({ on: () => () => undefined } as Record<string, unknown>, {
      get: (t, prop) => (prop in t ? t[prop as string] : () => undefined),
    });
  },
  parseDrawings: (x: unknown) => (Array.isArray(x) ? x : []),
  setFibLabelMode: () => undefined,
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

/** Every ResizeObserver ChartPanel created, and whether it still observes */
const observers: { live: boolean; callback: () => void }[] = [];

beforeEach(() => {
  h.series.length = 0;
  h.removedPaneIndices.length = 0;
  h.timeScaleHeight = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      live = false;
      callback: () => void;
      constructor(cb: () => void) {
        this.callback = cb;
        observers.push(this);
      }
      observe() {
        this.live = true;
      }
      disconnect() {
        this.live = false;
      }
    }
  );
  observers.length = 0;
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
  paneStores[0].getState().reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  /** Each pane's share of the summed stretch factors, in pane order */
  const shares = () => {
    const sum = h.panes.reduce((t, p) => t + p.factor, 0);
    return h.panes.map((p) => p.factor / sum);
  };

  it('[10.6.13] should size one indicator pane at 20% of a 500 px chart', () => {
    render(panel([inst('mom1', 'momentum')]));
    const [main, sub] = shares();
    expect(sub).toBeCloseTo(0.2, 10);
    expect(main).toBeCloseTo(0.8, 10);
  });

  it('[10.6.13] should give 2× Momentum + 2× MACD equal panes and the price pane half', () => {
    render(
      panel([
        inst('mom1', 'momentum'),
        inst('mom2', 'momentum'),
        inst('macd1', 'macd'),
        inst('macd2', 'macd'),
      ])
    );
    // 4 × 100 px would leave the price pane 100 of 500: they shrink to 62.5 px each
    const [main, ...subs] = shares();
    expect(main).toBeCloseTo(0.5, 10);
    for (const s of subs) expect(s).toBeCloseTo(0.125, 10);
  });

  it('[10.6.13] should rebalance on add, remove, hide and show, and keep a drag until then', () => {
    const one = [inst('mom1', 'momentum')];
    const { rerender } = render(panel(one));

    // The user drags the separator: price 0.6, Momentum 0.4
    h.panes[0].factor = 0.6;
    h.panes[1].factor = 0.4;
    // A settings change is not a rebalance — the drag stays
    rerender(panel([{ ...one[0], params: { length: 14 } }]));
    expect(shares()[1]).toBeCloseTo(0.4, 10);

    // Add → rebalanced: 2 × 20%
    const two = [one[0], inst('macd1', 'macd')];
    rerender(panel(two));
    expect(
      shares()
        .slice(1)
        .map((x) => +x.toFixed(10))
    ).toEqual([0.2, 0.2]);

    // Hide → back to one pane at 20%
    h.panes[1].factor = 5; // another drag, undone by the hide
    rerender(panel([one[0], inst('macd1', 'macd', false)]));
    expect(shares()).toHaveLength(2);
    expect(shares()[1]).toBeCloseTo(0.2, 10);

    // Show → rebalanced again; remove → rebalanced
    rerender(panel(two));
    expect(shares()[2]).toBeCloseTo(0.2, 10);
    rerender(panel([inst('macd1', 'macd')]));
    expect(shares()[1]).toBeCloseTo(0.2, 10);
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

describe('ChartPanel rebalance before the chart has a height', () => {
  it('[10.6.13] should keep one waiting observer across rebalances and disconnect it on unmount', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(0);
    const mom = inst('mom1', 'momentum');
    const macd = inst('macd1', 'macd');
    const { rerender, unmount } = render(panel([mom]));
    const liveAtMount = () => observers.filter((o) => o.live).length;
    // ChartPanel's own resize observer + the one waiting to rebalance
    expect(liveAtMount()).toBe(2);

    // Add, hide, show, remove — four more rebalances while the height is still 0
    rerender(panel([mom, macd]));
    rerender(panel([mom, { ...macd, enabled: false }]));
    rerender(panel([mom, macd]));
    rerender(panel([mom]));
    expect(observers.length).toBeGreaterThan(2); // each wait made a new one…
    expect(liveAtMount()).toBe(2); // …and disconnected the one before

    unmount();
    expect(observers.filter((o) => o.live)).toHaveLength(0);
  });

  it('[10.6.13] should keep waiting, not re-observe every frame, while the chart is shorter than its time axis', () => {
    // 20 px container, 26 px time axis: no pane area yet, though the container has a height
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(20);
    h.timeScaleHeight = 26;
    render(panel([inst('mom1', 'momentum')]));
    const waiting = observers.filter((o) => o.live);
    const created = observers.length;

    // The size changes but there's still no room: the same observer keeps waiting
    for (const o of waiting) o.callback();
    expect(observers.length).toBe(created);
    expect(observers.filter((o) => o.live)).toHaveLength(waiting.length);
  });
});
