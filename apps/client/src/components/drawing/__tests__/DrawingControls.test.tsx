/**
 * The selected drawing's floating toolbar, right-click menu and settings dialog
 * (components/drawing), on the forked library with a fake chart. TRADING_TEST_PLAN 10.7.19–10.7.21.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import type { DrawingManager } from 'lightweight-charts-drawing';
import { DrawingControls } from '@/components/drawing/DrawingControls';
import { capabilitiesOf } from '@/lib/drawingCapabilities';
import { resetClipboard } from '@/lib/drawingClipboard';
import { T0, addHorizontalLine, managerOnFakeChart } from '@/lib/__tests__/fakeDrawingChart';

let managers: DrawingManager[] = [];

class FakeResizeObserver {
  private readonly cb: () => void;
  constructor(cb: () => void) {
    this.cb = cb;
  }
  observe() {
    this.cb();
  }
  disconnect() {}
}

function setup() {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
  const f = managerOnFakeChart();
  managers.push(f.manager);
  const containerRef = createRef<HTMLDivElement>();
  const onCursor = vi.fn();
  const view = render(
    <div ref={containerRef}>
      <DrawingControls manager={f.manager} containerRef={containerRef} onCursor={onCursor} />
    </div>
  );
  return { ...f, containerRef, onCursor, view };
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
  cleanup();
  for (const m of managers) m.destroy();
  managers = [];
  resetClipboard();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('capabilitiesOf', () => {
  it('should give a line tool line and extend controls, a shape a fill, a text box text controls', () => {
    expect(capabilitiesOf('trend-line')).toMatchObject({
      line: true,
      extend: true,
      fill: false,
      text: false,
    });
    expect(capabilitiesOf('rectangle')).toMatchObject({ line: true, fill: true, text: false });
    expect(capabilitiesOf('text')).toMatchObject({
      line: false,
      text: true,
      textColorKey: 'color',
    });
    expect(capabilitiesOf('fib-retracement')).toMatchObject({ levels: true, fill: false });
  });
});

describe('floating toolbar', () => {
  it('[10.7.19] should show for a selection, with only the tool’s controls, and go when deselected', () => {
    const { manager } = setup();
    const id = addTrendLine(manager);
    expect(screen.queryByRole('toolbar', { name: 'Drawing' })).toBeNull();
    act(() => manager.select([id]));
    const bar = screen.getByRole('toolbar', { name: 'Drawing' });
    expect(within(bar).getByRole('button', { name: 'Line colour' })).toBeTruthy();
    expect(within(bar).queryByRole('button', { name: 'Fill colour' })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Text colour' })).toBeNull();
    act(() => manager.select([]));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('[10.7.19] should recolour, rewidth and restyle every selected drawing', () => {
    const { manager } = setup();
    const a = addTrendLine(manager);
    const b = addTrendLine(manager);
    act(() => manager.select([a, b]));
    fireEvent.click(screen.getByRole('button', { name: 'Line colour' }));
    fireEvent.click(screen.getByRole('radio', { name: '#f23645' }));
    fireEvent.click(screen.getByRole('button', { name: /Line width/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /3px/ }));
    fireEvent.click(screen.getByRole('button', { name: /Line style/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Dashed/ }));
    for (const id of [a, b]) {
      expect(manager.get(id)!.style).toMatchObject({
        color: '#f23645',
        width: 3,
        lineStyle: 'dashed',
      });
    }
  });

  it('[10.7.19] should lock, remove, and clone / hide from More', () => {
    const { manager } = setup();
    const id = addTrendLine(manager);
    act(() => manager.select([id]));
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(manager.get(id)!.locked).toBe(true);
    expect(screen.getByRole('button', { name: 'Unlock' }).getAttribute('aria-pressed')).toBe(
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Clone/ }));
    expect(manager.drawings()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Hide/ }));
    expect(manager.drawings().filter((d) => d.hidden)).toHaveLength(1);
    expect(screen.queryByRole('toolbar')).toBeNull();

    act(() => manager.select([id]));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(manager.get(id)).toBeUndefined();
  });

  it('should set a shape’s fill colour and opacity', () => {
    const { manager } = setup();
    const id = manager.add({
      kind: 'rectangle',
      points: [
        { time: T0 + 100, price: 900 },
        { time: T0 + 200, price: 950 },
      ],
    } as never);
    act(() => manager.select([id]));
    fireEvent.click(screen.getByRole('button', { name: 'Fill colour' }));
    fireEvent.click(screen.getByRole('radio', { name: '#4caf50' }));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } });
    expect(manager.get(id)!.style).toMatchObject({
      backgroundColor: '#4caf50',
      fillBackground: true,
      transparency: 60,
    });
  });

  it('should remember where it was dragged', () => {
    const { manager } = setup();
    act(() => manager.select([addTrendLine(manager)]));
    const handle = screen
      .getByRole('toolbar')
      .querySelector('[data-tooltip="Drag to move the toolbar"]')!;
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 20 });
    fireEvent.pointerMove(document, { clientX: 160, clientY: 120 });
    fireEvent.pointerUp(document);
    const saved = JSON.parse(localStorage.getItem('cd-drawing-toolbar-pos')!) as { top: number };
    expect(saved.top).toBeGreaterThan(8);
  });
});

describe('right-click menu', () => {
  it('[10.7.20] should open on a drawing with TradingView’s actions, and act on it', () => {
    const { manager, containerRef, chartEl } = setup();
    addHorizontalLine(manager, 900); // y = 100
    chartEl.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 150, clientY: 100, bubbles: true })
    );
    fireEvent.contextMenu(containerRef.current!, { clientX: 150, clientY: 100 });
    const menu = screen.getByRole('menu', { name: 'Drawing' });
    const names = within(menu)
      .getAllByRole('menuitem')
      .map((r) => r.textContent?.replace(/(Ctrl\+.*|⌘.*|Del)$/, ''));
    expect(names).toEqual([
      'Settings…',
      'Clone',
      'Copy',
      'Bring to front',
      'Send to back',
      'Lock',
      'Hide',
      'Remove',
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Remove/ }));
    expect(manager.drawings()).toHaveLength(0);
  });

  it('[10.7.20] should ignore a right-click in the middle of a drag', () => {
    const { manager, containerRef, chartEl, press, onCursor } = setup();
    const id = addHorizontalLine(manager, 900); // y = 100
    act(() => press(150, 100)); // select it
    chartEl.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 150, clientY: 100, button: 0, bubbles: true })
    );
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 130 }));
    fireEvent.contextMenu(containerRef.current!, { clientX: 150, clientY: 130 });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onCursor).not.toHaveBeenCalled();
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 150, clientY: 130 }));
    expect(manager.get(id)!.points[0]!.price).toBe(870); // the drag went on to its end
  });

  it('[10.7.20] should return to the cursor on a right-click off any drawing', () => {
    const { containerRef, onCursor } = setup();
    fireEvent.contextMenu(containerRef.current!, { clientX: 300, clientY: 250 });
    expect(onCursor).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('settings dialog', () => {
  it('[10.7.21] should edit a draft and apply it on Ok only', () => {
    const { manager } = setup();
    const id = addTrendLine(manager);
    const before = manager.get(id)!;
    act(() => manager.select([id]));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Trend Line' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Right' }));
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Line width' }), {
      target: { value: '4' },
    });
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Coordinates' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Point 1 price' }), {
      target: { value: '1,000.5' },
    });
    expect(manager.get(id)).toBe(before); // nothing yet
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ok' }));
    const d = manager.get(id)!;
    expect(d.style).toMatchObject({ extendRight: true, width: 4 });
    expect(d.points[0]!.price).toBe(1000.5);
  });

  it('[10.7.21] should drop the draft on Cancel and on Escape', () => {
    const { manager } = setup();
    const id = addTrendLine(manager);
    act(() => manager.select([id]));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    let dialog = screen.getByRole('dialog', { name: 'Trend Line' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Left' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(manager.get(id)!.style.extendLeft).toBeFalsy();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    dialog = screen.getByRole('dialog', { name: 'Trend Line' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Left' }));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(manager.get(id)!.style.extendLeft).toBeFalsy();
  });

  it('[10.7.21] should edit a text box’s text and size, and a Fib level’s visibility', () => {
    const { manager } = setup();
    const text = manager.add({
      kind: 'text',
      points: [{ time: T0 + 50, price: 900 }],
      text: 'Hi',
    } as never);
    act(() => manager.select([text]));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    let dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Text' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Text' }), {
      target: { value: 'Support' },
    });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Font size' }), {
      target: { value: '20' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ok' }));
    expect(manager.get(text)).toMatchObject({ text: 'Support', style: { fontSize: 20 } });

    const fib = manager.add({
      kind: 'fib-retracement',
      points: [
        { time: T0 + 100, price: 900 },
        { time: T0 + 200, price: 950 },
      ],
    } as never);
    act(() => manager.select([fib]));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    dialog = screen.getByRole('dialog');
    const first = within(dialog).getAllByRole('checkbox', { name: /^Level .* shown$/ })[0]!;
    const wasOn = (first as HTMLInputElement).checked;
    fireEvent.click(first);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ok' }));
    expect(manager.get(fib)!.style.levels![0]!.visible).toBe(!wasOn);
  });

  it('should refuse a price that is not a number and keep the last good one', () => {
    const { manager } = setup();
    const id = addTrendLine(manager);
    act(() => manager.select([id]));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Coordinates' }));
    const price = within(dialog).getByRole('textbox', { name: 'Point 2 price' });
    fireEvent.change(price, { target: { value: 'abc' } });
    expect(price.getAttribute('aria-invalid')).toBe('true');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ok' }));
    expect(manager.get(id)!.points[1]!.price).toBe(950);
  });
});

describe('table cells', () => {
  it('[10.7.22] should edit a cell of a selected Table in place: Enter saves, Esc cancels', () => {
    const { manager, press } = setup();
    const id = manager.add({ kind: 'table', points: [{ time: T0 + 50, price: 900 }] } as never);
    act(() => press(60, 108)); // select the table (its top-left cell)
    act(() => press(60, 108)); // a click on a cell of the selected table edits it
    const cell = screen.getByRole('textbox', { name: 'Table cell' });
    fireEvent.change(cell, { target: { value: 'Entry' } });
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(screen.queryByRole('textbox', { name: 'Table cell' })).toBeNull();
    expect(JSON.stringify(manager.get(id)!.style)).toContain('Entry');

    act(() => press(60, 108));
    const again = screen.getByRole('textbox', { name: 'Table cell' }) as HTMLTextAreaElement;
    expect(again.value).toBe('Entry');
    fireEvent.change(again, { target: { value: 'Nope' } });
    fireEvent.keyDown(again, { key: 'Escape' });
    expect(JSON.stringify(manager.get(id)!.style)).not.toContain('Nope');
  });
});
