/**
 * A read-only view of the charts for the Playwright tests (docs/TRADING_TEST_PLAN.md
 * rows 10.4.4–10.4.7, 12.1.2): the canvas can't be queried, so an e2e build (`VITE_E2E=1`, set only by
 * apps/e2e/playwright.config.ts) exposes each pane's visible time range, its last crosshair time and
 * its candle times on `window.__cdCharts`. 🔐 In every other build `import.meta.env.VITE_E2E` is
 * undefined, so the check below is false at build time and the bundler drops the code: nothing
 * about the charts is exposed in production.
 */

import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';

export interface ChartProbe {
  /** The visible time range, in seconds */
  range: () => { from: number; to: number } | null;
  /** The crosshair's time (s) as last reported, programmatic moves included; null when cleared */
  crosshairTime: () => number | null;
  /** Every candle's time (s), oldest first */
  times: () => number[];
  /** How many times the sync cleared this pane's crosshair (clearCrosshairPosition) */
  clears: () => number;
}

declare global {
  interface Window {
    __cdCharts?: (ChartProbe | undefined)[];
  }
}

export function exposeChartForE2e(
  pane: number,
  chart: IChartApi | null,
  series: ISeriesApi<'Candlestick'> | null
): void {
  if (import.meta.env.VITE_E2E !== '1') return;
  const charts = (window.__cdCharts ??= []);
  if (!chart || !series) {
    charts[pane] = undefined;
    return;
  }
  let crosshair: number | null = null;
  let clears = 0;
  chart.subscribeCrosshairMove((param) => {
    crosshair = param.time === undefined ? null : Number(param.time as Time);
  });
  // The sync drives the other panes through these, and a programmatic clear fires no event
  const set = chart.setCrosshairPosition.bind(chart);
  const clear = chart.clearCrosshairPosition.bind(chart);
  chart.setCrosshairPosition = (price, time, s) => {
    crosshair = Number(time);
    set(price, time, s);
  };
  chart.clearCrosshairPosition = () => {
    crosshair = null;
    clears += 1;
    clear();
  };
  charts[pane] = {
    range: () => {
      const r = chart.timeScale().getVisibleRange();
      return r ? { from: Number(r.from), to: Number(r.to) } : null;
    },
    crosshairTime: () => crosshair,
    times: () => series.data().map((d) => Number(d.time)),
    clears: () => clears,
  };
}
