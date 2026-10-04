/**
 * Clone and copy / paste of drawings (lib/drawingClipboard.ts + the fork's insertCopies).
 * TRADING_TEST_PLAN 10.7.14.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { DrawingManager } from 'lightweight-charts-drawing';
import {
  COPY_OFFSET_PX,
  cloneSelection,
  copySelection,
  hasClipboard,
  pasteClipboard,
  resetClipboard,
} from '@/lib/drawingClipboard';
import { T0, managerOnFakeChart } from './fakeDrawingChart';

let managers: DrawingManager[] = [];

function setup() {
  const f = managerOnFakeChart();
  managers.push(f.manager);
  return f;
}

function addTrendLine(manager: DrawingManager): string {
  return manager.add({
    kind: 'trend-line',
    points: [
      { time: T0 + 100, price: 900 },
      { time: T0 + 200, price: 950 },
    ],
  } as never);
}

afterEach(() => {
  for (const m of managers) m.destroy();
  managers = [];
  resetClipboard();
  document.body.innerHTML = '';
});

describe('drawing clipboard', () => {
  it('[10.7.14] should clone the selection a little right of and below it, selected and unlocked', () => {
    const { manager } = setup();
    const id = addTrendLine(manager);
    manager.update({ ...manager.get(id)!, locked: true });
    manager.select([id]);
    const [copy] = cloneSelection(manager);
    const d = manager.get(copy!)!;
    expect(d.points).toEqual([
      { time: T0 + 100 + COPY_OFFSET_PX, price: 900 - COPY_OFFSET_PX },
      { time: T0 + 200 + COPY_OFFSET_PX, price: 950 - COPY_OFFSET_PX },
    ]);
    expect(d.locked).toBe(false);
    expect(manager.selection()).toEqual([copy]);
    expect(manager.drawings()).toHaveLength(2);
  });

  it('[10.7.14] should copy in one pane and paste into another', () => {
    const a = setup();
    const b = setup();
    a.manager.select([addTrendLine(a.manager)]);
    expect(copySelection(a.manager)).toBe(1);
    expect(hasClipboard()).toBe(true);
    const ids = pasteClipboard(b.manager);
    expect(ids).toHaveLength(1);
    expect(b.manager.get(ids[0]!)!.kind).toBe('trend-line');
    expect(a.manager.drawings()).toHaveLength(1);
  });

  it('should keep the clipboard when nothing is selected, and paste nothing when it is empty', () => {
    const { manager } = setup();
    expect(pasteClipboard(manager)).toEqual([]);
    manager.select([addTrendLine(manager)]);
    copySelection(manager);
    manager.select([]);
    expect(copySelection(manager)).toBe(0);
    expect(pasteClipboard(manager)).toHaveLength(1);
    expect(cloneSelection(manager)).toHaveLength(1); // the pasted copy is selected
  });
});
