import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  setData: vi.fn(),
  setMarkers: vi.fn(),
  remove: vi.fn(),
  range: vi.fn(),
  getCandles: vi.fn(),
  createPriceLine: vi.fn(),
  removePriceLine: vi.fn(),
  seriesOptions: vi.fn(),
  applyOptions: vi.fn(),
  createChart: vi.fn(),
}));

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: {},
  LineStyle: { Dashed: 2 },
  TickMarkType: { Year: 0, Month: 1, DayOfMonth: 2, Time: 3, TimeWithSeconds: 4 },
  createChart: () => {
    h.createChart();
    return {
      addSeries: (_type: unknown, options: unknown) => {
        h.seriesOptions(options);
        return {
          setData: h.setData,
          createPriceLine: h.createPriceLine,
          removePriceLine: h.removePriceLine,
          applyOptions: h.applyOptions,
        };
      },
      timeScale: () => ({ setVisibleLogicalRange: h.range }),
      remove: h.remove,
    };
  },
  createSeriesMarkers: () => ({ setMarkers: h.setMarkers }),
}));
vi.mock('@crypto-dashboard/sdk', () => ({
  marketApi: { getCandles: (...a: unknown[]) => h.getCandles(...a) },
}));

import { LessonChart } from '@/guide/LessonChart';
import { clearLessonChartCache } from '@/guide/lessonChartLoader';
import type { ChartScene } from '@/guide/lessons';

const DAY = 86_400_000;
const scene: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2024-01-23',
  bars: 40,
  markers: [
    { date: '2024-01-10', text: 'Funds approved', position: 'above' },
    { date: '2024-01-23', text: '−14.5%', position: 'below' },
  ],
  freezeAt: '2024-01-10',
  label: 'A test chart',
  fallback: 'etf',
};

/** 40 daily candles ending 23 Jan 2024, as the server sends them (ms, oldest first) */
function candles() {
  const end = Date.UTC(2024, 0, 23);
  return Array.from({ length: 40 }, (_, i) => ({
    timestamp: end - (39 - i) * DAY,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
  }));
}

let reduced = true;
const lastData = () => h.setData.mock.calls.at(-1)?.[0] as unknown[] | undefined;
const lastMarkers = () => h.setMarkers.mock.calls.at(-1)?.[0] as { text: string }[] | undefined;

describe('LessonChart', () => {
  beforeEach(() => {
    clearLessonChartCache();
    for (const fn of Object.values(h)) fn.mockReset();
    h.getCandles.mockResolvedValue({ candles: candles() });
    reduced = true;
    window.matchMedia = ((q: string) => ({ matches: reduced, media: q })) as never;
  });
  afterEach(() => cleanup());

  it('should ask for the scene’s daily perpetual history, ending on its last day', async () => {
    render(<LessonChart scene={scene} revealed={false} fallback={<p>picture</p>} />);
    await waitFor(() => expect(h.setData).toHaveBeenCalled());
    expect(h.getCandles).toHaveBeenCalledWith('BTCUSDT', '1d', 40, 'linear', Date.UTC(2024, 0, 23));
    expect(screen.getByRole('img', { name: 'A test chart' })).toBeTruthy();
  });

  it('should stop on the freeze day, with only the markers so far, until the answer', async () => {
    const { rerender } = render(
      <LessonChart scene={scene} revealed={false} fallback={<p>picture</p>} />
    );
    await waitFor(() => expect(lastData()?.length).toBe(27)); // 15 Dec … 10 Jan
    expect(lastMarkers()?.map((m) => m.text)).toEqual(['Funds approved']);

    rerender(<LessonChart scene={scene} revealed fallback={<p>picture</p>} />);
    await waitFor(() => expect(lastData()?.length).toBe(40));
    expect(lastMarkers()?.map((m) => m.text)).toEqual(['Funds approved', '−14.5%']);
  });

  it('should play on a candle at a time when motion is welcome', async () => {
    reduced = false;
    const { rerender } = render(
      <LessonChart scene={scene} revealed={false} fallback={<p>picture</p>} />
    );
    await waitFor(() => expect(lastData()?.length).toBe(27));
    rerender(<LessonChart scene={scene} revealed fallback={<p>picture</p>} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    const n = lastData()?.length ?? 0;
    expect(n).toBeGreaterThan(27);
    expect(n).toBeLessThan(40);
  });

  it('should keep the drawn picture when the history can’t be loaded, and try again next time', async () => {
    h.getCandles.mockRejectedValueOnce(new Error('offline'));
    render(<LessonChart scene={scene} revealed={false} fallback={<p>picture</p>} />);
    await waitFor(() => expect(screen.getByText('picture')).toBeTruthy());
    cleanup();

    render(<LessonChart scene={scene} revealed={false} fallback={<p>picture</p>} />);
    await waitFor(() => expect(h.setData).toHaveBeenCalled());
    expect(h.getCandles).toHaveBeenCalledTimes(2);
  });

  it('should load a scene once for the card and the question that share it, and tidy up', async () => {
    const first = render(<LessonChart scene={scene} revealed={false} fallback={null} />);
    await waitFor(() => expect(h.setData).toHaveBeenCalled());
    first.unmount();
    expect(h.remove).toHaveBeenCalled();
    render(<LessonChart scene={scene} revealed fallback={null} />);
    await waitFor(() => expect(lastData()?.length).toBe(40));
    expect(h.getCandles).toHaveBeenCalledTimes(1);
  });

  it('should draw a Choose buy or sell plan as a dashed price line with its label', async () => {
    const withPlan: ChartScene = { ...scene, planLine: { price: 41_000, label: 'Your plan' } };
    render(<LessonChart scene={withPlan} revealed={false} fallback={<p>picture</p>} />);
    await waitFor(() => expect(h.createPriceLine).toHaveBeenCalled());
    expect(h.createPriceLine).toHaveBeenCalledWith(
      expect.objectContaining({ price: 41_000, title: 'Your plan', lineStyle: 2 })
    );
  });

  it('should draw no price line on a scene without a plan', async () => {
    render(<LessonChart scene={scene} revealed={false} fallback={<p>picture</p>} />);
    await waitFor(() => expect(h.setData).toHaveBeenCalled());
    expect(h.createPriceLine).not.toHaveBeenCalled();
  });

  it('should show whole dollars for Bitcoin and cents for Solana, on the same chart', async () => {
    const format = () =>
      (h.applyOptions.mock.calls.at(-1)?.[0] as { priceFormat: { precision: number } }).priceFormat
        .precision;
    const { rerender } = render(<LessonChart scene={scene} revealed fallback={<p>picture</p>} />);
    await waitFor(() => expect(h.applyOptions).toHaveBeenCalled());
    expect(format()).toBe(0);
    rerender(
      <LessonChart scene={{ ...scene, symbol: 'SOLUSDT' }} revealed fallback={<p>picture</p>} />
    );
    await waitFor(() => expect(format()).toBe(2));
    // Not a new chart: its data and plan line stay
    expect(h.createChart).toHaveBeenCalledTimes(1);
  });
});
