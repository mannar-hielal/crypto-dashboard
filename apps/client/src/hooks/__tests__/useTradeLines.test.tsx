/**
 * Chart position / order lines (BP-3): drawn on the pane's candle series, kept in sync with the
 * account, and a dragged TP line is sent as an amend only after it is confirmed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useTradeLines } from '../useTradeLines';
import { usePaperStore, type Position } from '@/store/paperStore';
import { useAuthStore } from '@/store/authStore';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { emptyState, fakePaperApi, resetFakePaperApi } from '@/test/fakePaperApi';

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  paperApi: (await import('@/test/fakePaperApi')).fakePaperApi,
  marketApi: {
    getInstruments: vi.fn(async () => ({
      instruments: [{ symbol: 'BTCUSDT', tickSize: 0.1, qtyStep: 0.001 }],
    })),
  },
}));

/** A price line as the fake series keeps it */
interface FakeLine {
  opts: { price: number; title: string };
  options: () => { price: number };
  applyOptions: (o: Partial<FakeLine['opts']>) => void;
}

/** Fake candle series: 1 px per 10 USDT, price 50,000 at y = 500 (higher price → smaller y). */
function fakeSeries() {
  const lines: FakeLine[] = [];
  const series = {
    lines,
    createPriceLine: vi.fn((opts: FakeLine['opts']) => {
      const line: FakeLine = {
        opts: { ...opts },
        options: () => line.opts,
        applyOptions: (o) => Object.assign(line.opts, o),
      };
      lines.push(line);
      return line;
    }),
    removePriceLine: vi.fn((line: FakeLine) => lines.splice(lines.indexOf(line), 1)),
    priceToCoordinate: (p: number) => 500 - (p - 50_000) / 10,
    coordinateToPrice: (y: number) => 50_000 + (500 - y) * 10,
  };
  return series;
}

const position: Position = {
  id: 'p1',
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'long',
  quantity: 0.1,
  entryPrice: 50_000,
  entryUsdtAmount: 500,
  leverage: 10,
  entryFee: 2.75,
  closeFeeReserve: 2.475,
  extraMargin: 0,
  liqPrice: 45_148.99,
  bustPrice: 45_000,
  positionIM: 502.475,
  positionMM: 18.975,
  cumFunding: 0,
  openedAt: 1,
  takeProfit: 55_000,
};

function setup(toolActive = false) {
  const series = fakeSeries();
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  document.body.appendChild(container);
  container.getBoundingClientRect = () => ({ top: 0, left: 0 }) as DOMRect;
  const chart = { applyOptions: vi.fn() };
  const hook = renderHook(() =>
    useTradeLines({
      paneIndex: 0,
      chartRef: { current: chart as unknown as IChartApi },
      candleRef: { current: series as unknown as ISeriesApi<'Candlestick'> },
      containerRef: { current: container },
      toolActive,
    })
  );
  const pointer = (type: string, clientY: number) =>
    act(() => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 });
      canvas.dispatchEvent(e);
    });
  return { series, chart, container, hook, pointer };
}

beforeEach(() => {
  usePaperStore.getState().clear();
  usePaperStore.getState().hydrate(emptyState());
  useAuthStore.setState({ accessToken: 'test-token' });
  resetFakePaperApi();
  useLayoutStore.setState((s) => ({
    activePane: 0,
    showMarkPriceLine: true,
    panes: s.panes.map((p, i) => (i === 0 ? { ...p, symbol: 'BTCUSDT', category: 'linear' } : p)),
  }));
  paneStores[0].setState({ markPrice: 50_400 });
  usePaperStore.setState({ positions: [position] });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useTradeLines', () => {
  it('draws the position’s lines and follows the mark price', () => {
    const { series } = setup();
    expect(series.lines.map((l) => l.opts.title)).toEqual([
      'Long 0.1  +$40.00',
      'TP',
      'Liq.',
      'Mark',
    ]);
    act(() => paneStores[0].setState({ markPrice: 50_500 }));
    expect(series.lines[0].opts.title).toBe('Long 0.1  +$50.00');
    expect(series.lines.find((l) => l.opts.title === 'Mark')?.opts.price).toBe(50_500);
  });

  it('removes the lines when the position closes', () => {
    const { series } = setup();
    act(() => usePaperStore.setState({ positions: [] }));
    expect(series.lines.map((l) => l.opts.title)).toEqual(['Mark']);
  });

  it('drag a TP line → confirm → the amend is sent at the dropped price (tick-rounded)', async () => {
    const { series, chart, hook, pointer } = setup();
    // TP 55,000 is at y = 0; drop it at y = 12.34 → 54,876.6
    pointer('pointerdown', 1);
    expect(chart.applyOptions).toHaveBeenCalledWith({ handleScroll: false, handleScale: false });
    pointer('pointermove', 12.34);
    pointer('pointerup', 12.34);
    expect(hook.result.current.amend).toMatchObject({ label: 'take-profit', price: 54_876.6 });
    expect(series.lines.find((l) => l.opts.title === 'TP')?.opts.price).toBe(54_876.6);
    expect(fakePaperApi.updatePositionExits).not.toHaveBeenCalled();

    await act(() => hook.result.current.confirmAmend());
    expect(fakePaperApi.updatePositionExits).toHaveBeenCalledWith(
      'p1',
      { takeProfit: '54876.6', stopLoss: null },
      'test-token'
    );
    await waitFor(() => expect(hook.result.current.amend).toBeNull());
  });

  it('cancel puts the line back and sends nothing', () => {
    const { series, hook, pointer } = setup();
    pointer('pointerdown', 0);
    pointer('pointermove', 20);
    pointer('pointerup', 20);
    act(() => hook.result.current.cancelAmend());
    expect(series.lines.find((l) => l.opts.title === 'TP')?.opts.price).toBe(55_000);
    expect(fakePaperApi.updatePositionExits).not.toHaveBeenCalled();
  });

  it('lines take no pointer while a drawing tool is active', () => {
    const { chart, hook, pointer } = setup(true);
    pointer('pointerdown', 0);
    pointer('pointermove', 20);
    pointer('pointerup', 20);
    expect(chart.applyOptions).not.toHaveBeenCalled();
    expect(hook.result.current.amend).toBeNull();
  });
});
