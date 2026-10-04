/**
 * The dashboard's drawing session (hooks/useDrawingSession.ts): shortcuts, undo and copy / paste
 * reach the active pane's drawings. TRADING_TEST_PLAN 10.7.13–10.7.15.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { DrawingManager } from 'lightweight-charts-drawing';
import { useDrawingSession } from '@/hooks/useDrawingSession';
import { useLayoutStore } from '@/store/layoutStore';
import { resetClipboard } from '@/lib/drawingClipboard';
import { addHorizontalLine, managerOnFakeChart } from '@/lib/__tests__/fakeDrawingChart';

let managers: DrawingManager[] = [];
const releases: (() => void)[] = [];

function pane(session: ReturnType<typeof useDrawingSession>, index: number) {
  const f = managerOnFakeChart();
  managers.push(f.manager);
  releases.push(session.onManagerReady(index, f.manager));
  return f;
}

const ctrl = (code: string, extra: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, ctrlKey: true, ...extra }));
const flush = () => act(() => Promise.resolve());

beforeEach(() => useLayoutStore.setState(useLayoutStore.getInitialState(), true));
afterEach(() => {
  for (const r of releases.splice(0)) r();
  for (const m of managers) m.destroy();
  managers = [];
  resetClipboard();
  cleanup();
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('useDrawingSession', () => {
  it('[10.7.15] should arm the tool of an Alt shortcut in the active pane', () => {
    const { result } = renderHook(() => useDrawingSession());
    const a = pane(result.current, 0);
    const b = pane(result.current, 1);
    act(() => useLayoutStore.getState().setActivePane(1));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', altKey: true }));
    });
    expect(result.current.activeToolType).toBe('horizontal-line');
    expect(b.manager.tool()).toBe('horizontal-line');
    expect(a.manager.tool()).toBeNull();
  });

  it('[10.7.13] should undo and redo the active pane’s edits with Ctrl+Z / Ctrl+Y', async () => {
    const { result } = renderHook(() => useDrawingSession());
    const a = pane(result.current, 0);
    addHorizontalLine(a.manager, 900);
    await flush();
    act(() => ctrl('KeyZ'));
    expect(a.manager.drawings()).toHaveLength(0);
    act(() => ctrl('KeyY'));
    expect(a.manager.drawings()).toHaveLength(1);
  });

  it('[10.7.14] should copy the selection with Ctrl+C and paste it with Ctrl+V', () => {
    const { result } = renderHook(() => useDrawingSession());
    const a = pane(result.current, 0);
    a.manager.select([addHorizontalLine(a.manager, 900)]);
    act(() => ctrl('KeyC'));
    act(() => ctrl('KeyV'));
    expect(a.manager.drawings()).toHaveLength(2);
    expect(a.manager.selection()).toHaveLength(1);
  });

  it('[10.7.17] should remove the active pane’s drawings and bring hidden ones back', async () => {
    const { result } = renderHook(() => useDrawingSession());
    const a = pane(result.current, 0);
    const id = addHorizontalLine(a.manager, 900);
    a.manager.update({ ...a.manager.get(id)!, hidden: true });
    addHorizontalLine(a.manager, 800);
    expect(result.current.drawingCounts()).toEqual({ total: 2, hidden: 1 });
    act(() => result.current.showHiddenDrawings());
    expect(result.current.drawingCounts()).toEqual({ total: 2, hidden: 0 });
    await flush();
    act(() => result.current.removeDrawings());
    expect(a.manager.drawings()).toHaveLength(0);
    await flush();
    act(() => {
      result.current.undo();
    });
    expect(a.manager.drawings()).toHaveLength(2);
  });

  it('[10.7.16] should give a pane mounted later the current magnet and stay switches', () => {
    const { result } = renderHook(() => useDrawingSession());
    act(() => result.current.setMagnet({ on: true, mode: 'strong' }));
    act(() => result.current.setStayInDrawingMode(true));
    const a = pane(result.current, 2);
    a.manager.setTool('horizontal-line');
    a.press(100, 97); // price 903
    expect(a.manager.tool()).toBe('horizontal-line'); // stayed armed
    // Strong magnet: snapped to the bar's nearest OHLC, the close (fake bars: O 900 H 910 L 890 C 905)
    expect(a.manager.drawings()[0]!.points[0]!.price).toBe(905);
  });
});

describe('the pre-July drawing store', () => {
  it('should be removed once the dashboard opens; the per-symbol sets stay', () => {
    localStorage.setItem('cd-drawings', JSON.stringify({ state: { drawings: [] }, version: 4 }));
    localStorage.setItem('cd-drawings-v2-BTCUSDT', '[]');
    localStorage.setItem('cd-drawings-BTCUSDT', '[]'); // 0.1's, kept for a rollback
    renderHook(() => useDrawingSession());
    expect(localStorage.getItem('cd-drawings')).toBeNull();
    expect(localStorage.getItem('cd-drawings-v2-BTCUSDT')).toBe('[]');
    expect(localStorage.getItem('cd-drawings-BTCUSDT')).toBe('[]');
  });
});
