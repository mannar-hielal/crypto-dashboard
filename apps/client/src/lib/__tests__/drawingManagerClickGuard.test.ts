/**
 * The click-to-select guard wraps lightweight-charts-drawing's private `handleClick`. These tests run
 * the real library, so they fail if an upgrade stops subscribing the guard (the override would then
 * silently do nothing) or the guard loses the manager as `this`.
 */

import { describe, expect, it, vi } from 'vitest';
import { DrawingManager } from 'lightweight-charts-drawing';
import { guardClicksToPricePane } from '@/lib/drawingManager';

type ClickParam = { paneIndex?: number; point?: { x: number; y: number } };

function attachWithFakeChart(manager: DrawingManager) {
  let subscribed: ((p: ClickParam) => void) | null = null;
  const chart = {
    subscribeClick: (h: (p: ClickParam) => void) => {
      subscribed = h;
    },
    unsubscribeClick: () => {},
  };
  const container = document.createElement('div');
  manager.attach(chart as never, {} as never, container);
  return () => subscribed!;
}

describe('guardClicksToPricePane', () => {
  it('should be the handler attach() subscribes to chart clicks', () => {
    const manager = new DrawingManager();
    guardClicksToPricePane(manager);
    const guard = (manager as unknown as { handleClick: unknown }).handleClick;
    const subscribed = attachWithFakeChart(manager);
    expect(subscribed()).toBe(guard);
  });

  // The library's handler hit-tests the click (then selects or deselects): stub the hit test so no
  // real chart is needed, and use it as the sign that the library handler ran, with `this` intact
  function spyHitTest(manager: DrawingManager) {
    return vi
      .spyOn(manager as unknown as { hitTest: (p: unknown) => null }, 'hitTest')
      .mockReturnValue(null);
  }

  it('should ignore a click in an indicator pane', () => {
    const manager = new DrawingManager();
    const hitTest = spyHitTest(manager);
    vi.spyOn(manager, 'deselectAll').mockImplementation(() => {});
    guardClicksToPricePane(manager);
    const subscribed = attachWithFakeChart(manager);
    subscribed()({ paneIndex: 1, point: { x: 10, y: 5 } });
    expect(hitTest).not.toHaveBeenCalled();
  });

  it('should pass a price-pane click to the library with the manager as this', () => {
    const manager = new DrawingManager();
    const hitTest = spyHitTest(manager);
    const deselect = vi.spyOn(manager, 'deselectAll').mockImplementation(() => {});
    guardClicksToPricePane(manager);
    const subscribed = attachWithFakeChart(manager);
    subscribed()({ paneIndex: 0, point: { x: 10, y: 5 } });
    expect(hitTest).toHaveBeenCalledWith({ x: 10, y: 5 });
    expect(deselect).toHaveBeenCalledTimes(1);
  });
});
