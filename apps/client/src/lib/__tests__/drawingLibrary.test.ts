/**
 * The forked drawing library (src/vendor/lightweight-charts-drawing) on a fake chart: the product
 * rules ChartPanel relies on it for — drawings stay in the price pane (no placement from an
 * indicator pane or an axis), a placement returns to the cursor with the drawing selected, and
 * drawings never take part in the price-axis autoscale.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { DrawingManager } from 'lightweight-charts-drawing';
import { PANE_H, PANE_W, T0, addHorizontalLine, managerOnFakeChart } from './fakeDrawingChart';

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
  it('[10.6.5] should place a trend line from two clicks in the price pane, then return to the cursor with it selected', () => {
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

  it('should place nothing from a press on the price axis', () => {
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
});
