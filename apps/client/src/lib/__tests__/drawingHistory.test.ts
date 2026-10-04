/**
 * Undo / redo of a pane's drawings (lib/drawingHistory.ts), on the fork with a fake chart.
 * TRADING_TEST_PLAN 10.7.13.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { DrawingManager } from 'lightweight-charts-drawing';
import { MAX_UNDO_STEPS, createDrawingHistory } from '@/lib/drawingHistory';
import { addHorizontalLine, managerOnFakeChart } from './fakeDrawingChart';

let managers: DrawingManager[] = [];

function setup(isExternal?: () => boolean) {
  const f = managerOnFakeChart();
  managers.push(f.manager);
  return { ...f, history: createDrawingHistory(f.manager, isExternal) };
}

const flush = () => Promise.resolve();
const prices = (m: DrawingManager) => m.drawings().map((d) => d.points[0]!.price);

afterEach(() => {
  for (const m of managers) m.destroy();
  managers = [];
  document.body.innerHTML = '';
});

describe('createDrawingHistory', () => {
  it('[10.7.13] should undo and redo adds and removes, one edit a step', async () => {
    const { manager, history } = setup();
    const a = addHorizontalLine(manager, 900);
    await flush();
    addHorizontalLine(manager, 800);
    await flush();
    manager.remove(a);
    await flush();
    expect(prices(manager)).toEqual([800]);

    expect(history.undo()).toBe(true);
    expect(prices(manager)).toEqual([900, 800]);
    expect(history.undo()).toBe(true);
    expect(prices(manager)).toEqual([900]);
    expect(history.redo()).toBe(true);
    expect(prices(manager)).toEqual([900, 800]);
    expect(history.canRedo()).toBe(true);
  });

  it('[10.7.13] should undo a whole drag in one step, not each pointer move', async () => {
    const { manager, chartEl, press, history } = setup();
    addHorizontalLine(manager, 900); // y = 100
    await flush();
    press(150, 100); // select it
    chartEl.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 150, clientY: 100, button: 0, bubbles: true })
    );
    for (const y of [110, 120, 130, 140]) {
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: y }));
      await flush();
    }
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 150, clientY: 140 }));
    expect(prices(manager)).toEqual([860]);

    history.undo();
    expect(prices(manager)).toEqual([900]);
    history.undo();
    expect(prices(manager)).toEqual([]);
  });

  it('[10.7.13] should bring back every drawing of a Remove all in one step', async () => {
    const { manager, history } = setup();
    addHorizontalLine(manager, 900);
    addHorizontalLine(manager, 800);
    await flush();
    manager.clear();
    await flush();
    history.undo();
    expect(prices(manager)).toEqual([900, 800]);
  });

  it('should drop the redo steps after a new edit', async () => {
    const { manager, history } = setup();
    addHorizontalLine(manager, 900);
    await flush();
    history.undo();
    addHorizontalLine(manager, 700);
    await flush();
    expect(history.redo()).toBe(false);
    expect(prices(manager)).toEqual([700]);
  });

  it('should start over on a load or a copy from another pane, so undo stays in this set', async () => {
    let external = false;
    const { manager, history } = setup(() => external);
    addHorizontalLine(manager, 900);
    await flush();
    external = true;
    manager.importJSON([]); // the pane switched to a symbol without drawings
    external = false;
    expect(history.canUndo()).toBe(false);
    expect(history.undo()).toBe(false);
    expect(prices(manager)).toEqual([]);
  });

  it(`should keep at most ${MAX_UNDO_STEPS} steps`, async () => {
    const { manager, history } = setup();
    for (let i = 0; i < MAX_UNDO_STEPS + 5; i++) {
      addHorizontalLine(manager, i);
      await flush();
    }
    let steps = 0;
    while (history.undo()) steps++;
    expect(steps).toBe(MAX_UNDO_STEPS);
    expect(manager.drawings()).toHaveLength(5);
  });

  it('should stop recording once destroyed', async () => {
    const { manager, history } = setup();
    history.destroy();
    addHorizontalLine(manager, 900);
    await flush();
    expect(history.undo()).toBe(false);
  });
});
