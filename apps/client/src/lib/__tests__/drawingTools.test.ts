/**
 * Toolbar tools around the drawing library (lib/drawingTools.ts), on the fork with a fake chart.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawingManager } from 'lightweight-charts-drawing';
import {
  applyStayInDrawingMode,
  connectPaneManager,
  loadStayInDrawingMode,
  keepSelectionInOnePane,
  nextActiveTool,
  startEraser,
} from '@/lib/drawingTools';
import { addHorizontalLine, managerOnFakeChart } from './fakeDrawingChart';

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
  localStorage.clear();
});

describe('startEraser', () => {
  it('[10.7.2] should remove the drawing clicked, and only that one', () => {
    const { manager, press } = setup();
    const hit = addHorizontalLine(manager, 900); // y = 100
    const other = addHorizontalLine(manager, 800); // y = 200
    startEraser(manager);
    press(150, 100);
    expect(manager.get(hit)).toBeUndefined();
    expect(manager.get(other)).toBeDefined();
  });

  it('[10.7.2] should keep a locked drawing', () => {
    const { manager, press } = setup();
    const id = addHorizontalLine(manager, 900);
    manager.update({ ...manager.get(id)!, locked: true });
    startEraser(manager);
    press(150, 100);
    expect(manager.get(id)).toBeDefined();
  });

  it('[10.7.2] should disarm a drawing tool and place nothing', () => {
    const { manager, press } = setup();
    manager.setTool('trend-line');
    startEraser(manager);
    expect(manager.tool()).toBeNull();
    press(100, 100);
    press(200, 50);
    expect(manager.drawings()).toHaveLength(0);
  });

  it('[10.7.2] should stop erasing once switched off', () => {
    const { manager, press } = setup();
    const id = addHorizontalLine(manager, 900);
    const stop = startEraser(manager);
    stop();
    press(150, 100);
    expect(manager.get(id)).toBeDefined();
    expect(manager.selection()).toEqual([id]);
  });
});

describe('nextActiveTool', () => {
  it('should keep the Eraser or zoom-in when the library disarms', () => {
    expect(nextActiveTool('eraser', null)).toBe('eraser');
    expect(nextActiveTool('zoom-in', null)).toBe('zoom-in');
  });

  it('should follow the library otherwise', () => {
    expect(nextActiveTool('trend-line', null)).toBeNull();
    expect(nextActiveTool('eraser', 'rectangle')).toBe('rectangle');
    expect(nextActiveTool(null, 'trend-line')).toBe('trend-line');
  });
});

describe('keepSelectionInOnePane', () => {
  it('[10.7.3] should keep the selection, and so Delete, to the pane last clicked', () => {
    const a = setup();
    const b = setup();
    const panes = () => [a.manager, b.manager];
    keepSelectionInOnePane(a.manager, panes);
    keepSelectionInOnePane(b.manager, panes);
    const lineA = addHorizontalLine(a.manager, 900);
    const lineB = addHorizontalLine(b.manager, 900);

    a.press(150, 100);
    b.press(150, 100);
    expect(a.manager.selection()).toEqual([]);
    expect(b.manager.selection()).toEqual([lineB]);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(b.manager.get(lineB)).toBeUndefined();
    expect(a.manager.get(lineA)).toBeDefined();
  });
});

describe('connectPaneManager', () => {
  it('should track the pane’s manager and its tool events until the cleanup, then forget both', () => {
    const panes: (DrawingManager | null)[] = [null, null];
    const a = setup();
    const tools: (string | null)[] = [];
    const release = connectPaneManager(panes, 0, a.manager, (k) => tools.push(k));
    expect(panes[0]).toBe(a.manager);
    a.manager.setTool('trend-line');
    expect(tools).toEqual(['trend-line']);

    release();
    expect(panes[0]).toBeNull();
    a.manager.setTool(null);
    expect(tools).toEqual(['trend-line']);
  });

  it('should leave the slot to a newer manager (a remount) on the old one’s cleanup', () => {
    const panes: (DrawingManager | null)[] = [null];
    const old = setup();
    const next = setup();
    const releaseOld = connectPaneManager(panes, 0, old.manager, () => undefined);
    connectPaneManager(panes, 0, next.manager, () => undefined);
    releaseOld();
    expect(panes[0]).toBe(next.manager);
  });

  it('should stop clearing the other panes’ selection after the cleanup', () => {
    const panes: (DrawingManager | null)[] = [null, null];
    const a = setup();
    const b = setup();
    const releaseA = connectPaneManager(panes, 0, a.manager, () => undefined);
    connectPaneManager(panes, 1, b.manager, () => undefined);
    addHorizontalLine(a.manager, 900);
    const lineB = addHorizontalLine(b.manager, 900);
    releaseA();
    b.press(150, 100);
    a.press(150, 100);
    expect(b.manager.selection()).toEqual([lineB]);
  });
});

describe('stay in drawing mode', () => {
  it('[10.7.12] should leave the tool armed and the drawing unselected after a placement when on', () => {
    const panes: (DrawingManager | null)[] = [null];
    const a = setup();
    connectPaneManager(panes, 0, a.manager, () => undefined, true);
    a.manager.setTool('trend-line');
    a.press(100, 100);
    a.press(200, 50);
    expect(a.manager.drawings()).toHaveLength(1);
    expect(a.manager.tool()).toBe('trend-line');
    expect(a.manager.selection()).toEqual([]);
    a.press(100, 150); // straight into the next one
    a.press(200, 150);
    expect(a.manager.drawings()).toHaveLength(2);
  });

  it('[10.7.12] should return to the cursor with the drawing selected when off (TradingView default)', () => {
    const panes: (DrawingManager | null)[] = [null];
    const a = setup();
    connectPaneManager(panes, 0, a.manager, () => undefined);
    a.manager.setTool('trend-line');
    a.press(100, 100);
    a.press(200, 50);
    expect(a.manager.tool()).toBeNull();
    expect(a.manager.selection()).toEqual([a.manager.drawings()[0]!.id]);
  });

  it('[10.7.12] should switch every pane and remember the switch across a reload', () => {
    const panes: (DrawingManager | null)[] = [null, null, null];
    const a = setup();
    const b = setup();
    connectPaneManager(panes, 0, a.manager, () => undefined, loadStayInDrawingMode());
    connectPaneManager(panes, 2, b.manager, () => undefined, loadStayInDrawingMode());
    expect(loadStayInDrawingMode()).toBe(false);

    applyStayInDrawingMode(panes, true);
    expect(loadStayInDrawingMode()).toBe(true);
    for (const pane of [a, b]) {
      pane.manager.setTool('horizontal-line');
      pane.press(100, 100);
      expect(pane.manager.tool()).toBe('horizontal-line');
    }

    applyStayInDrawingMode(panes, false);
    expect(loadStayInDrawingMode()).toBe(false);
  });

  it('should read as off when storage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadStayInDrawingMode()).toBe(false);
    expect(() => applyStayInDrawingMode([], true)).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });
});
