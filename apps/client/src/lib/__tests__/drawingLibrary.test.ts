/**
 * The forked drawing library (src/vendor/lightweight-charts-drawing) on a fake chart: the product
 * rules ChartPanel relies on it for — drawings stay in the price pane (no placement from an
 * indicator pane or an axis), a placement returns to the cursor with the drawing selected, and
 * drawings never take part in the price-axis autoscale.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCoords } from 'lightweight-charts-drawing';
import type { DrawingManager, OHLC } from 'lightweight-charts-drawing';
import {
  PANE_H,
  PANE_W,
  T0,
  addHorizontalLine,
  fakeChart,
  managerOnFakeChart,
} from './fakeDrawingChart';

let managers: DrawingManager[] = [];

function setup() {
  const f = managerOnFakeChart();
  managers.push(f.manager);
  return f;
}

afterEach(() => {
  for (const m of managers) m.destroy();
  managers = [];
  document.body.innerHTML = '';
});

describe('forked drawing library on a chart', () => {
  it('[10.6.5][10.7.5] should place a trend line from two clicks in the price pane, then return to the cursor with it selected', () => {
    const { manager, press } = setup();
    const tools: (string | null)[] = [];
    manager.on('tool', (k) => tools.push(k));
    manager.setTool('trend-line');
    press(100, 100);
    press(200, 50);
    const [d] = manager.drawings();
    expect(manager.drawings()).toHaveLength(1);
    expect(d!.kind).toBe('trend-line');
    expect(d!.points).toEqual([
      { time: T0 + 100, price: 900 },
      { time: T0 + 200, price: 950 },
    ]);
    expect(manager.tool()).toBeNull();
    expect(tools.at(-1)).toBeNull();
    expect(manager.selection()).toEqual([d!.id]);
  });

  it('[10.6.5] should place nothing from presses below the price pane (an indicator pane)', () => {
    const { manager, press } = setup();
    manager.setTool('trend-line');
    press(100, PANE_H + 40);
    press(200, PANE_H + 60);
    expect(manager.drawings()).toHaveLength(0);
    expect(manager.tool()).toBe('trend-line');
  });

  it('[10.7.6] should place nothing from a press on the price axis', () => {
    const { manager, press } = setup();
    manager.setTool('horizontal-line');
    press(PANE_W + 20, 100);
    expect(manager.drawings()).toHaveLength(0);
  });

  it('should not select a drawing from a press in an indicator pane', () => {
    const { manager, press } = setup();
    addHorizontalLine(manager, 900);
    press(150, PANE_H + 50);
    expect(manager.selection()).toEqual([]);
    // The control: the same x on the line in the price pane selects it
    press(150, 100);
    expect(manager.selection()).toHaveLength(1);
  });

  it('should keep drawings out of the price-axis autoscale', () => {
    const { attached } = setup();
    expect(attached).toHaveLength(1);
    expect('autoscaleInfo' in attached[0]!).toBe(false);
  });

  it('should save an edited text in the drawing itself', () => {
    const { manager } = setup();
    const id = manager.add({ kind: 'text', points: [{ time: T0 + 5, price: 900 }] } as never);
    manager.update({ ...manager.get(id)!, text: 'Breakout' });
    const saved = JSON.parse(manager.exportJSON()) as { text?: string }[];
    expect(saved[0]!.text).toBe('Breakout');
  });

  it('should skip a locked drawing on Delete', () => {
    const { manager, press } = setup();
    const locked = addHorizontalLine(manager, 900);
    manager.update({ ...manager.get(locked)!, locked: true });
    press(150, 100);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(manager.get(locked)).toBeDefined();
  });

  it('[10.7.1] should place no zero-length drawing from a double-click — the second point waits for a real click', () => {
    const { manager, press } = setup();
    manager.setTool('trend-line');
    press(100, 100);
    press(101, 101); // the double-click's second press, on the first point
    expect(manager.drawings()).toHaveLength(0);
    press(200, 50);
    expect(manager.drawings()[0]!.points).toEqual([
      { time: T0 + 100, price: 900 },
      { time: T0 + 200, price: 950 },
    ]);
  });

  it('[10.7.7] should hold the chart still while an anchor is dragged, and give it back on release', () => {
    const { manager, chart, chartEl, press } = setup();
    const applyOptions = vi.fn();
    chart.applyOptions = applyOptions;
    const id = addHorizontalLine(manager, 900);
    press(150, 100); // select it
    applyOptions.mockClear();
    chartEl.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 150, clientY: 100, button: 0, bubbles: true })
    );
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 140 }));
    expect(applyOptions).toHaveBeenCalledWith({ handleScroll: false, handleScale: false });
    expect(manager.get(id)!.points[0]!.price).toBe(860);
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 150, clientY: 140 }));
    expect(applyOptions).toHaveBeenLastCalledWith({
      handleScroll: { mouseWheel: true },
      handleScale: { mouseWheel: true },
    });
  });
});

describe('forked drawing library: drags stay in the price pane', () => {
  it('[10.7.7] should stop a dragged anchor at the price pane’s bottom edge', () => {
    const { manager, chartEl, press } = setup();
    const id = addHorizontalLine(manager, 900); // y = 100
    press(150, 100); // select it
    chartEl.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 150, clientY: 100, button: 0, bubbles: true })
    );
    // Far below the pane, into an indicator pane
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: PANE_H + 200 }));
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 150, clientY: PANE_H + 200 }));
    expect(manager.get(id)!.points[0]!.price).toBe(1000 - PANE_H);
  });

  it('[10.7.7] should stop a dragged trend-line end at the price axis', () => {
    const { manager, chartEl, press } = setup();
    manager.setTool('trend-line');
    press(100, 100);
    press(200, 50);
    const id = manager.drawings()[0]!.id;
    chartEl.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 200, clientY: 50, button: 0, bubbles: true })
    );
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: PANE_W + 80, clientY: -40 }));
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: PANE_W + 80, clientY: -40 }));
    const end = manager.get(id)!.points[1]!;
    expect(end.price).toBe(1000);
    expect(Number(end.time)).toBeLessThanOrEqual(T0 + PANE_W);
  });
});

describe('forked drawing library: times between and after bars', () => {
  // 5-minute bars, as after switching a 1-minute chart to 5m
  const bars: OHLC[] = Array.from({ length: 10 }, (_, i) => ({
    time: (T0 + i * 300) as OHLC['time'],
    open: 1,
    high: 1,
    low: 1,
    close: 1,
  }));

  function coords() {
    const { chart, series } = fakeChart();
    // Bars sit at x = 0, 10, 20, …: logical index i ↔ x = 10 i, and only bar times map exactly
    const ts = chart.timeScale();
    Object.assign(ts, {
      timeToCoordinate: (t: number) => {
        const i = bars.findIndex((b) => b.time === t);
        return i < 0 ? null : i * 10;
      },
      logicalToCoordinate: (l: number) => l * 10,
      coordinateToTime: () => null,
    });
    return makeCoords(chart as never, series as never, () => bars);
  }

  it('[10.7.8] should place a time between two bars (a 1-minute point on 5-minute bars) between them', () => {
    // T0 + 60 s is a fifth of the way from bar 0 to bar 1
    expect(coords().timeToX((T0 + 60) as OHLC['time'])).toBeCloseTo(2, 6);
  });

  it('[10.7.8] should place a time after the last bar on the extrapolated bar grid', () => {
    // Two bar intervals after the last bar (index 9)
    expect(coords().timeToX((T0 + 11 * 300) as OHLC['time'])).toBeCloseTo(110, 6);
  });
});
