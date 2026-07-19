import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { TextDrawingEditor } from '../TextDrawingEditor';
import type { Drawing } from '@/lib/drawing/types';

// ─── Notes ─────────────────────────────────────────────────────────────────
//
// framer-motion is intentionally NOT mocked. An earlier attempt to mock
// motion.div as React.forwardRef(...createElement(tag, props)) silently broke
// React 19's synthetic event delegation — onKeyDown handlers on the textarea
// (a child of motion.div) were never invoked even though native keydown
// listeners fired. Letting the real lib load is the safer default. jsdom
// handles motion.div as a plain div, which is all we need for these tests.

// ─── Test fixture ──────────────────────────────────────────────────────────

function makeTextDrawing(overrides: Partial<Drawing> = {}): Drawing {
  return {
    id: 'drawing-1',
    zIndex: 1,
    isLocked: false,
    color: '#a555e2',
    textColor: '#fcfcfd',
    lineWidth: 1,
    lineStyle: 'solid',
    fontSize: 14,
    backgroundColor: '#0a0a0a',
    shape: { type: 'text', points: [{ time: 1700000000 as never, price: 50000 }] },
    paneIndex: 0,
    ...overrides,
  };
}

// ─── Refs + container fixture ──────────────────────────────────────────────
//
// The chart container must be attached to `document.body` so we can dispatch
// native `pointerdown` events on it (jsdom won't deliver events to detached
// elements). Tests receive the container back so they can fire such events.
//
// The container's `getBoundingClientRect` is stubbed so the editor's `pos`
// state becomes non-null even under jsdom's zero-rect default.

function makeRefs() {
  const containerEl = document.createElement('div');
  containerEl.getBoundingClientRect = () => ({
    left: 100,
    top: 200,
    right: 200,
    bottom: 300,
    width: 100,
    height: 100,
    x: 100,
    y: 200,
    toJSON: () => ({}),
  });
  document.body.appendChild(containerEl);

  const timeScale = { timeToCoordinate: () => 50 };
  const series = { priceToCoordinate: () => 60 };
  const chart = { timeScale: () => timeScale };

  return {
    chartRef: { current: chart as never },
    seriesRef: { current: series as never },
    containerRef: { current: containerEl },
    container: containerEl,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('TextDrawingEditor — StrictMode regression', () => {
  beforeEach(() => {
    // jsdom doesn't implement HTMLCanvasElement.prototype.getContext. The
    // editor creates an offscreen canvas to measure text width; stub the 2D
    // context so measuring succeeds and the editor's pos state becomes
    // non-null. Only measureText/save/restore are called in the editor path.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: () => ({ width: 64 }),
      save: () => {},
      restore: () => {},
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Detach any leftover chart containers from earlier tests so the next
    // suite's makeRefs starts clean.
    document.querySelectorAll('body > div').forEach((el) => el.remove());
    cleanup();
  });

  it('does NOT call onCommit immediately after mount', () => {
    // Regression test: an earlier version of TextDrawingEditor had a
    // useEffect cleanup that called onCommit on unmount. Under React
    // StrictMode (enabled in main.tsx) effects run mount → unmount → mount
    // in dev, so the cleanup fired after the first mount and dispatched
    // onCommit, which caused the parent to call setEditingDrawingId(null),
    // unmounting the editor before the user could interact. This test
    // asserts onCommit is never called merely as a side effect of mounting
    // or re-mounting the editor.
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    const refs = makeRefs();
    const { unmount } = render(
      <TextDrawingEditor
        drawing={makeTextDrawing()}
        chartRef={refs.chartRef}
        seriesRef={refs.seriesRef}
        containerRef={refs.containerRef}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );

    expect(onCommit).not.toHaveBeenCalled();

    // Simulate StrictMode's mount → unmount → mount cycle by literally
    // unmounting and re-rendering a fresh instance. The regression would
    // have fired onCommit during the unmount phase.
    unmount();
    const refs2 = makeRefs();
    render(
      <TextDrawingEditor
        drawing={makeTextDrawing()}
        chartRef={refs2.chartRef}
        seriesRef={refs2.seriesRef}
        containerRef={refs2.containerRef}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits on Enter and cancels on Escape', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    const refs = makeRefs();
    render(
      <TextDrawingEditor
        drawing={makeTextDrawing({ label: 'Initial' })}
        chartRef={refs.chartRef}
        seriesRef={refs.seriesRef}
        containerRef={refs.containerRef}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );

    const ta = screen.getByPlaceholderText('Enter text') as HTMLTextAreaElement;
    expect(ta.value).toBe('Initial');

    // Editing updates state via onChange.
    fireEvent.change(ta, { target: { value: 'Edited' } });
    expect(ta.value).toBe('Edited');

    // Escape discards in-progress edits and calls onCancel — onCommit
    // should NOT fire.
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('TextDrawingEditor — pointerdown commit semantics', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: () => ({ width: 64 }),
      save: () => {},
      restore: () => {},
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('body > div').forEach((el) => el.remove());
    cleanup();
  });

  it('pointerdown INSIDE the editor does NOT commit', () => {
    // Right-click inside the textarea (intended for Cut/Copy/Paste) should
    // leave the editor mounted. The previous onBlur={commit} implementation
    // closed the editor any time the textarea lost focus. The new pointerdown
    // listener checks `target.closest('[data-text-drawing-editor]')` and bails.
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    const refs = makeRefs();
    render(
      <TextDrawingEditor
        drawing={makeTextDrawing({ label: 'Initial' })}
        chartRef={refs.chartRef}
        seriesRef={refs.seriesRef}
        containerRef={refs.containerRef}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );

    const ta = screen.getByPlaceholderText('Enter text') as HTMLTextAreaElement;

    // Right-click style pointerdown INSIDE the textarea (simulating the user
    // right-clicking inside the editor — button=2 for proper right-click,
    // or button=0 + ctrlKey=true on Mac).
    fireEvent.pointerDown(ta, { button: 2, clientX: 0, clientY: 0 });

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    // Editor should still be in the document.
    expect(screen.getByPlaceholderText('Enter text')).toBeTruthy();
  });

  it('pointerdown INSIDE the chart container commits + closes', () => {
    // Left-click (or right-click) on the chart canvas outside the editor
    // area should commit the current text and close the editor — matches the
    // "click outside to commit" UX from TradingView.
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    const refs = makeRefs();
    render(
      <TextDrawingEditor
        drawing={makeTextDrawing({ label: 'Initial' })}
        chartRef={refs.chartRef}
        seriesRef={refs.seriesRef}
        containerRef={refs.containerRef}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );

    const ta = screen.getByPlaceholderText('Enter text') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'Hello' } });

    // Simulate pointerdown on the chart container. The editor portal lives in
    // document.body (sibling of container), so the listener must use
    // `container.contains(target)` to recognise the click as outside-editor.
    fireEvent.pointerDown(refs.container, { button: 0, clientX: 0, clientY: 0 });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('drawing-1', 'Hello');
  });

  it('pointerdown OUTSIDE the chart container does NOT commit', () => {
    // Clicks on other UI (DrawingPropertiesMenu portal, color picker, body)
    // should NOT close the editor — the user might be changing color / line
    // weight via the props toolbar while editing text.
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    const refs = makeRefs();
    render(
      <TextDrawingEditor
        drawing={makeTextDrawing({ label: 'Initial' })}
        chartRef={refs.chartRef}
        seriesRef={refs.seriesRef}
        containerRef={refs.containerRef}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );

    // Simulate pointerdown on a "props toolbar" element outside both the
    // editor portal and the chart container.
    const outsideEl = document.createElement('div');
    document.body.appendChild(outsideEl);
    fireEvent.pointerDown(outsideEl, { button: 0, clientX: 0, clientY: 0 });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Enter text')).toBeTruthy();

    outsideEl.remove();
  });
});
