/**
 * A fake lightweight-charts chart + series for the forked drawing library's DrawingManager
 * (src/vendor/lightweight-charts-drawing): just the calls it makes. 1 px = 1 s on the time axis
 * (a bar every second from T0), price = 1000 − y, and the price pane is PANE_W × PANE_H px at the
 * chart's top-left. jsdom lays nothing out, so client coordinates are pane coordinates.
 */

import { DrawingManager } from 'lightweight-charts-drawing';

export const PANE_W = 400;
export const PANE_H = 300;
export const T0 = 1000;

export function fakeChart() {
  const chartEl = document.createElement('div');
  const paneEl = document.createElement('div');
  chartEl.appendChild(paneEl);
  document.body.appendChild(chartEl);
  const attached: object[] = [];
  const bars = Array.from({ length: PANE_W }, (_, i) => ({
    time: T0 + i,
    open: 900,
    high: 910,
    low: 890,
    close: 905,
  }));
  const timeScale = {
    coordinateToTime: (x: number) => (x >= 0 && x < PANE_W ? T0 + Math.round(x) : null),
    timeToCoordinate: (t: number) => (t >= T0 && t < T0 + PANE_W ? t - T0 : null),
    coordinateToLogical: (x: number) => x,
    logicalToCoordinate: (l: number) => l,
    getVisibleRange: () => ({ from: T0, to: T0 + PANE_W - 1 }),
    height: () => 20,
    width: () => PANE_W,
  };
  const chart = {
    chartElement: () => chartEl,
    priceScale: () => ({ width: () => 0 }),
    paneSize: () => ({ width: PANE_W, height: PANE_H }),
    options: () => ({
      layout: { fontFamily: 'sans-serif', fontSize: 12, background: { color: '#000000' } },
      handleScroll: { mouseWheel: true },
      handleScale: { mouseWheel: true },
      localization: { locale: 'en-US' },
      timeScale: { timeVisible: true, secondsVisible: false },
    }),
    applyOptions: () => undefined,
    timeScale: () => timeScale,
  };
  const series = {
    attachPrimitive: (p: object) => attached.push(p),
    detachPrimitive: () => undefined,
    getPane: () => ({ paneIndex: () => 0, getHTMLElement: () => paneEl }),
    coordinateToPrice: (y: number) => 1000 - y,
    priceToCoordinate: (p: number) => 1000 - p,
    data: () => bars,
    priceScale: () => ({ options: () => ({ mode: 0 }) }),
    options: () => ({ priceFormat: { minMove: 0.01 } }),
    priceFormatter: () => ({ format: (p: number) => p.toFixed(2) }),
  };
  return { chart, series, chartEl, attached };
}

/** A manager on its own fake chart, and a left-button press + release at pane coordinates */
export function managerOnFakeChart() {
  const f = fakeChart();
  const manager = new DrawingManager(f.chart as never, f.series as never);
  const press = (x: number, y: number) => {
    f.chartEl.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0, bubbles: true })
    );
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
  };
  return { ...f, manager, press };
}

/** A horizontal line at price `price` (y = 1000 − price) */
export function addHorizontalLine(manager: DrawingManager, price: number): string {
  return manager.add({ kind: 'horizontal-line', points: [{ time: T0 + 10, price }] } as never);
}
