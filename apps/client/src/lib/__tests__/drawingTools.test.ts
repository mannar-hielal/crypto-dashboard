/**
 * Toolbar tools around the drawing library (lib/drawingTools.ts), on the fork with a fake chart.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { DrawingManager } from 'lightweight-charts-drawing';
import { nextActiveTool, startEraser } from '@/lib/drawingTools';
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
