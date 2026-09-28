/**
 * Multi-chart layout (T2 · RTL) — docs/TRADING_TEST_PLAN.md Sections 10.1, 10.2, 10.3, 10.5.
 *
 * Renders the SymbolBar (with the real ChartLayoutPicker) above MultiChartArea, the way the
 * dashboard does. ChartPanel is mocked — lightweight-charts needs a canvas — and records the
 * symbol / interval each pane's chart is given. Controls are found by their guide anchors (F1).
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { MultiChartArea } from '../MultiChartArea';
import { SymbolBar } from '../SymbolBar';
import { useLayoutStore, type LayoutId } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { getByGuide, queryByGuide } from '@/test/guide';
import { guideSelector } from '@/lib/guideAnchors';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const FRAMER_PROPS = vi.hoisted(
  () => new Set(['whileHover', 'whileTap', 'layoutId', 'initial', 'animate', 'exit', 'transition'])
);

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(
          (
            { children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>,
            ref: React.Ref<HTMLElement>
          ) => {
            // Drop framer-only props so they don't reach the DOM
            const rest = Object.fromEntries(
              Object.entries(props).filter(([k]) => !FRAMER_PROPS.has(k))
            );
            return React.createElement(tag, { ...rest, ref }, children);
          }
        ),
    }
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
}));

/** Every render of a pane's chart: which pane, and the symbol / interval it was given. */
const chartRenders = vi.hoisted(() => [] as { pane: number; symbol: string; interval: string }[]);

vi.mock('@/components/dashboard/ChartPanel', () => ({
  ChartPanel: ({
    paneIndex,
    symbol,
    interval,
  }: {
    paneIndex: number;
    symbol: string;
    interval: string;
  }) => {
    chartRenders.push({ pane: paneIndex, symbol, interval });
    return (
      <div data-testid="chart-mock" data-symbol={symbol} data-interval={interval}>
        {symbol} {interval}
      </div>
    );
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderDashboardCharts() {
  return render(
    <>
      <SymbolBar
        tradingPanelOpen
        onToggleTrading={vi.fn()}
        leftToolbarOpen={false}
        onToggleLeftToolbar={vi.fn()}
      />
      <MultiChartArea />
    </>
  );
}

/** Open the layout picker and choose a layout. */
function pickLayout(id: LayoutId) {
  fireEvent.click(getByGuide(document.body, 'layout.picker'));
  fireEvent.click(getByGuide(document.body, 'layout.option', id));
}

function panes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(guideSelector('pane')));
}

function pane(index: number): HTMLElement {
  return getByGuide(document.body, 'pane', String(index));
}

/** The chart mock inside one pane. */
function chartOf(index: number): HTMLElement {
  const el = pane(index).querySelector<HTMLElement>('[data-testid="chart-mock"]');
  if (!el) throw new Error(`pane ${index} has no chart`);
  return el;
}

function gridOf(): HTMLElement {
  const grid = panes()[0]?.parentElement;
  if (!grid) throw new Error('no pane grid');
  return grid;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  useLayoutStore.setState(useLayoutStore.getInitialState(), true);
  for (const store of paneStores) store.getState().reset();
  chartRenders.length = 0;
});

afterEach(() => {
  cleanup();
});

// ─── 10.1 Layout switching ───────────────────────────────────────────────────

describe('Section 10.1 — layout switching', () => {
  it('should offer the 5 layouts in the picker (10.1.1)', () => {
    renderDashboardCharts();
    fireEvent.click(getByGuide(document.body, 'layout.picker'));

    const options = Array.from(
      document.querySelectorAll<HTMLElement>(guideSelector('layout.option'))
    );
    expect(options.map((o) => o.getAttribute('data-guide-key'))).toEqual([
      '1',
      '2h',
      '2v',
      '3h',
      '4',
    ]);
    expect(options.map((o) => o.getAttribute('title'))).toEqual([
      'Single chart',
      '2 columns',
      '2 rows',
      '3 columns',
      '2×2 grid',
    ]);
  });

  it.each([
    // [layout, panes, grid columns, grid rows] — rows 10.1.2–10.1.5
    ['2h', 2, '0.5fr 0.5fr', '1fr'],
    ['2v', 2, '1fr', '0.5fr 0.5fr'],
    ['3h', 3, `${1 / 3}fr ${1 / 3}fr ${1 / 3}fr`, '1fr'],
    ['4', 4, '0.5fr 0.5fr', '0.5fr 0.5fr'],
  ] as const)(
    'should show %s as %i panes in its grid, each with a PaneHeader',
    (layout, count, columns, rows) => {
      renderDashboardCharts();
      pickLayout(layout);

      expect(useLayoutStore.getState().layout).toBe(layout);
      expect(panes()).toHaveLength(count);
      expect(gridOf().style.gridTemplateColumns).toBe(columns);
      expect(gridOf().style.gridTemplateRows).toBe(rows);
      for (const p of panes()) {
        expect(queryByGuide(p, 'pane.header.symbol')).not.toBeNull();
      }
    }
  );

  it('should go back to one pane with no PaneHeader when 1 is picked (10.1.6, 10.5.3)', () => {
    renderDashboardCharts();
    pickLayout('4');
    expect(panes()).toHaveLength(4);

    pickLayout('1');

    expect(panes()).toHaveLength(1);
    expect(gridOf().style.gridTemplateColumns).toBe('1fr');
    expect(queryByGuide(document.body, 'pane.header.symbol')).toBeNull();
    expect(queryByGuide(document.body, 'pane.header.dot')).toBeNull();
  });
});

// ─── 10.2 Active pane ─────────────────────────────────────────────────────────

describe('Section 10.2 — active pane', () => {
  /** The animated left stripe PaneHeader draws on the active pane. */
  function stripeIn(p: HTMLElement) {
    return p.querySelector('.w-0\\.5.absolute');
  }

  it('should make the clicked pane active and move the border back on a second click (10.2.1, 10.2.2)', () => {
    renderDashboardCharts();
    pickLayout('2h');
    expect(pane(0).getAttribute('data-active')).toBe('true');

    fireEvent.click(getByGuide(pane(1), 'pane.chart', '1'));

    expect(useLayoutStore.getState().activePane).toBe(1);
    expect(pane(1).getAttribute('data-active')).toBe('true');
    expect(pane(0).hasAttribute('data-active')).toBe(false);

    fireEvent.click(getByGuide(pane(0), 'pane.chart', '0'));

    expect(useLayoutStore.getState().activePane).toBe(0);
    expect(pane(0).getAttribute('data-active')).toBe('true');
    expect(pane(1).hasAttribute('data-active')).toBe(false);
  });

  it('should make the order form and SymbolBar follow the active pane (10.2.1)', () => {
    renderDashboardCharts();
    pickLayout('2h');
    // Re-query after each render: the framer-motion mock remounts motion.* elements
    const picker = () => getByGuide(document.body, 'symbolbar.symbol-picker');
    expect(picker().textContent).toContain('BTC');

    fireEvent.click(getByGuide(pane(1), 'pane.chart', '1'));

    expect(picker().textContent).toContain('ETH');
    expect(picker().textContent).not.toContain('BTC');
  });

  it('should move the PaneHeader stripe to pane 3 in the 4-pane layout (10.2.3)', () => {
    renderDashboardCharts();
    pickLayout('4');
    expect(stripeIn(pane(0))).not.toBeNull();

    // A click on the header activates its pane too
    fireEvent.click(getByGuide(pane(2), 'pane.header.symbol').parentElement!.parentElement!);

    expect(useLayoutStore.getState().activePane).toBe(2);
    expect(pane(2).getAttribute('data-active')).toBe('true');
    expect(stripeIn(pane(2))).not.toBeNull();
    for (const i of [0, 1, 3]) expect(stripeIn(pane(i))).toBeNull();
  });
});

// ─── 10.3 Per-pane symbol and interval ───────────────────────────────────────

describe('Section 10.3 — per-pane symbol and interval', () => {
  it('should switch only pane 0 to ETH from its PaneHeader picker (10.3.1)', () => {
    renderDashboardCharts();
    pickLayout('2h');
    // Pane 1 starts on ETH; put it on SOL so the two can't be confused
    useLayoutStore.getState().setPaneSymbol(1, 'SOLUSDT');

    fireEvent.click(getByGuide(pane(0), 'pane.header.symbol'));
    fireEvent.click(getByGuide(pane(0), 'pane.header.symbol-option', 'ETHUSDT'));

    expect(chartOf(0).dataset.symbol).toBe('ETHUSDT');
    expect(chartOf(1).dataset.symbol).toBe('SOLUSDT');
    expect(getByGuide(pane(0), 'pane.header.symbol').textContent).toContain('ETH');
    expect(getByGuide(pane(1), 'pane.header.symbol').textContent).toContain('SOL');
  });

  it("should send 5m to pane 1's chart only (10.3.2)", () => {
    renderDashboardCharts();
    pickLayout('2h');
    chartRenders.length = 0;

    fireEvent.click(getByGuide(pane(1), 'pane.header.interval-picker'));
    fireEvent.click(getByGuide(document.body, 'pane.header.interval', '5m'));

    expect(chartOf(1).dataset.interval).toBe('5m');
    expect(chartOf(0).dataset.interval).toBe('1m');
    expect(chartRenders.some((r) => r.pane === 1 && r.interval === '5m')).toBe(true);
    expect(chartRenders.filter((r) => r.pane === 0).every((r) => r.interval === '1m')).toBe(true);
    // Choosing an interval in a pane also makes that pane active
    expect(useLayoutStore.getState().activePane).toBe(1);
  });

  it('should change only the active pane from the SymbolBar picker (10.3.3)', () => {
    renderDashboardCharts();
    pickLayout('2h');
    fireEvent.click(getByGuide(pane(1), 'pane.chart', '1'));

    fireEvent.click(getByGuide(document.body, 'symbolbar.symbol-picker'));
    fireEvent.click(getByGuide(document.body, 'symbolbar.symbol-option', 'SOLUSDT'));

    expect(chartOf(1).dataset.symbol).toBe('SOLUSDT');
    expect(chartOf(0).dataset.symbol).toBe('BTCUSDT');
  });
});

// ─── 10.5 PaneHeader elements ────────────────────────────────────────────────

describe('Section 10.5 — PaneHeader elements', () => {
  it('should show symbol, interval, live price with its change, and the connection dot in multi-pane mode (10.5.1 structure)', () => {
    renderDashboardCharts();
    pickLayout('2h');
    act(() => {
      paneStores[0].setState({ latestPrice: 50_000, priceChange: 500, isConnected: true });
    });

    const p0 = pane(0);
    expect(getByGuide(p0, 'pane.header.symbol').textContent).toContain('BTC');
    expect(getByGuide(p0, 'pane.header.interval-picker').textContent).toContain('1m');
    expect(getByGuide(p0, 'pane.header.price').textContent).toContain('50,000.00');
    // 500 up from 49,500 → +1.01%
    expect(getByGuide(p0, 'pane.header.change').textContent).toBe('+1.01%');
    expect(getByGuide(p0, 'pane.header.dot').className).toContain('pulse-live-dot');

    // Pane 1 has no price yet and no connection
    expect(queryByGuide(pane(1), 'pane.header.price')).toBeNull();
    expect(getByGuide(pane(1), 'pane.header.dot').className).not.toContain('pulse-live-dot');
  });

  it('should render no PaneHeader in the 1 layout (10.5.3)', () => {
    renderDashboardCharts();

    expect(useLayoutStore.getState().layout).toBe('1');
    expect(panes()).toHaveLength(1);
    expect(queryByGuide(pane(0), 'pane.header.symbol')).toBeNull();
    expect(queryByGuide(pane(0), 'pane.header.interval-picker')).toBeNull();
  });
});
