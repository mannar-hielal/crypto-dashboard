/**
 * The indicator legends (owner decision H, 2026-10-03): a header row per indicator pane, overlay
 * rows in the price pane's column, values from the crosshair with the last bar as the fallback,
 * and settings / hide / remove as labelled buttons.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { IChartApi, IPaneApi, ISeriesApi, MouseEventParams, Time } from 'lightweight-charts';
import { IndicatorLegends } from '../IndicatorLegends';
import type {
  IndicatorInstance,
  IndicatorPrimitive,
  IndicatorSeries,
} from '@/lib/indicators/types';
import { guideSelector } from '@/lib/guideAnchors';
import { chart as chartTokens } from '@/lib/tokens';

// ─── Fakes ───────────────────────────────────────────────────────────────────

function series(color: string, data: object[]): IndicatorSeries {
  return { options: () => ({ color }), data: () => data } as unknown as IndicatorSeries;
}

function primitive(legend: IndicatorSeries[]): IndicatorPrimitive {
  return { legendSeries: () => legend, getSeries: () => legend } as unknown as IndicatorPrimitive;
}

function instance(
  instanceId: string,
  indicatorId: string,
  params: IndicatorInstance['params'],
  enabled = true
): IndicatorInstance {
  return {
    instanceId,
    indicatorId,
    params,
    color: chartTokens.vwap,
    lineWidth: 2,
    lineStyle: 'solid',
    enabled,
  };
}

let crosshairHandler: ((p: MouseEventParams<Time>) => void) | null = null;
const chart = {
  subscribeCrosshairMove: (h: (p: MouseEventParams<Time>) => void) => (crosshairHandler = h),
  unsubscribeCrosshairMove: () => (crosshairHandler = null),
} as unknown as IChartApi;
const source = {
  subscribeDataChanged: () => undefined,
  unsubscribeDataChanged: () => undefined,
} as unknown as ISeriesApi<'Candlestick'>;

/** A pane whose row element sits `top` px below the chart's top */
function pane(index: number, top: number): IPaneApi<Time> {
  const el = document.createElement('tr');
  el.getBoundingClientRect = () => ({ top, height: 100 }) as DOMRect;
  return { paneIndex: () => index, getHTMLElement: () => el } as unknown as IPaneApi<Time>;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

const momLine = series(chartTokens.vwap, [
  { time: 1, value: 4 },
  { time: 2, value: -1.5 },
]);
const emaLine = series(chartTokens.ema20, [
  { time: 1, value: 100 },
  { time: 2, value: 101 },
]);

const INDICATORS = [
  instance('ema_1', 'ema', { length: 20, source: 'close' }),
  instance('mom_1', 'momentum', { length: 10, source: 'close' }),
];

function renderLegends(
  overrides: { indicators?: IndicatorInstance[]; onRemove?: () => void; onUpdate?: () => void } = {}
) {
  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({ top: 0, height: 500 }) as DOMRect;
  const containerRef = { current: container };
  const primitiveRefs = {
    current: new Map([
      ['ema_1', primitive([emaLine])],
      ['mom_1', primitive([momLine])],
    ]),
  };
  const paneRefs = { current: new Map([['mom_1', pane(1, 400)]]) };
  return render(
    <IndicatorLegends
      chart={chart}
      source={source}
      containerRef={containerRef}
      indicators={overrides.indicators ?? INDICATORS}
      primitiveRefs={primitiveRefs}
      paneRefs={paneRefs}
      layoutVersion={1}
      priceLegend={<div>OHLC</div>}
      onRemove={overrides.onRemove ?? (() => undefined)}
      onUpdate={overrides.onUpdate ?? (() => undefined)}
    />
  );
}

function legendRow(anchor: 'indicator.pane-legend' | 'indicator.legend', id: string) {
  const el = document.querySelector<HTMLElement>(guideSelector(anchor, id));
  if (!el) throw new Error(`no ${anchor} ${id}`);
  return el;
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  crosshairHandler = null;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('IndicatorLegends', () => {
  it('should put a sub-pane indicator in a header at its pane top, with its inputs', () => {
    renderLegends();
    const header = legendRow('indicator.pane-legend', 'mom_1');
    expect(header.textContent).toContain('Mom 10 close');
    expect(header.style.top).toBe('400px');
  });

  it('[10.6.1] should move a pane header when the price pane above it changes height', () => {
    // The real chart: a price pane and Momentum's pane below it; only the price pane resizes
    const observed: Element[] = [];
    let onResize: () => void = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          onResize = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {}
      }
    );
    const pricePane = pane(0, 0);
    const momPane = pane(1, 3); // laid out before the rebalance: right under the chart's top
    const withPanes = { ...chart, panes: () => [pricePane, momPane] } as unknown as IChartApi;
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ top: 0, height: 500 }) as DOMRect;
    render(
      <IndicatorLegends
        chart={withPanes}
        source={source}
        containerRef={{ current: container }}
        indicators={INDICATORS}
        primitiveRefs={{
          current: new Map([
            ['ema_1', primitive([emaLine])],
            ['mom_1', primitive([momLine])],
          ]),
        }}
        paneRefs={{ current: new Map([['mom_1', momPane]]) }}
        layoutVersion={1}
        priceLegend={<div>OHLC</div>}
        onRemove={() => undefined}
        onUpdate={() => undefined}
      />
    );
    expect(legendRow('indicator.pane-legend', 'mom_1').style.top).toBe('3px');
    expect(observed).toContain(pricePane.getHTMLElement());

    // The rebalance grows the price pane: Momentum's pane moves down without changing size
    momPane.getHTMLElement()!.getBoundingClientRect = () => ({ top: 400, height: 100 }) as DOMRect;
    act(() => onResize());
    expect(legendRow('indicator.pane-legend', 'mom_1').style.top).toBe('400px');
  });

  it('should stack an overlay under the price legend', () => {
    renderLegends();
    const row = legendRow('indicator.legend', 'ema_1');
    expect(row.textContent).toContain('EMA 20 close');
    expect(row.previousElementSibling?.textContent).toBe('OHLC');
  });

  it('should show the last bar values while the crosshair is off the chart', () => {
    renderLegends();
    expect(legendRow('indicator.pane-legend', 'mom_1').textContent).toContain('-1.50');
    expect(legendRow('indicator.legend', 'ema_1').textContent).toContain('101.00');
  });

  it('[10.6.7] should show the values under the crosshair, then fall back when it leaves', () => {
    renderLegends();
    act(() =>
      crosshairHandler?.({
        time: 1 as Time,
        point: { x: 10, y: 10 },
        seriesData: new Map<unknown, unknown>([
          [source, { time: 1 }],
          [momLine, { time: 1, value: 4 }],
          [emaLine, { time: 1, value: 100 }],
        ]),
      } as unknown as MouseEventParams<Time>)
    );
    expect(legendRow('indicator.pane-legend', 'mom_1').textContent).toContain('4.00');
    expect(legendRow('indicator.legend', 'ema_1').textContent).toContain('100.00');

    act(() => crosshairHandler?.({ seriesData: new Map() } as unknown as MouseEventParams<Time>));
    expect(legendRow('indicator.pane-legend', 'mom_1').textContent).toContain('-1.50');
  });

  it('[10.6.7] should fall back to the last bar past the newest candle (no candle under the crosshair)', () => {
    renderLegends();
    act(() =>
      crosshairHandler?.({
        time: 99 as Time,
        point: { x: 10, y: 10 },
        seriesData: new Map(),
      } as unknown as MouseEventParams<Time>)
    );
    expect(legendRow('indicator.pane-legend', 'mom_1').textContent).toContain('-1.50');
  });

  it('should colour each value with its series colour', () => {
    renderLegends();
    const value = screen.getByText('-1.50');
    expect(value.style.color).toBe('rgb(249, 115, 22)'); // chart.vwap
  });

  it('should label the controls and wire hide / remove', () => {
    const onRemove = vi.fn();
    const onUpdate = vi.fn();
    renderLegends({ onRemove, onUpdate });

    const remove = screen.getByRole('button', { name: 'Remove: Mom 10 close' });
    expect(remove.getAttribute('data-guide')).toBe('indicator.remove');
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledWith('mom_1');

    fireEvent.click(screen.getByRole('button', { name: 'Hide: Mom 10 close' }));
    expect(onUpdate).toHaveBeenCalledWith('mom_1', { enabled: false });

    expect(screen.getByRole('button', { name: 'Settings: Mom 10 close' })).toBeTruthy();
  });

  it('should open the settings modal from the gear', () => {
    renderLegends();
    fireEvent.click(screen.getByRole('button', { name: 'Settings: EMA 20 close' }));
    expect(screen.getByText('EMA — Settings')).toBeTruthy();
  });

  it('[10.6.6] should move a hidden sub-pane indicator to the price pane column, values hidden', () => {
    renderLegends({
      indicators: [instance('mom_1', 'momentum', { length: 10, source: 'close' }, false)],
    });
    const row = legendRow('indicator.legend', 'mom_1');
    expect(row.textContent).not.toContain('-1.50');
    expect(screen.getByRole('button', { name: 'Show: Mom 10 close' })).toBeTruthy();
  });

  it('should drop an unknown indicator id instead of crashing', () => {
    expect(() => renderLegends({ indicators: [instance('x', 'nope', {})] })).not.toThrow();
  });
});
