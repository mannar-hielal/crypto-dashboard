/**
 * LeftToolbar — TradingView's drawing toolbar: stay in drawing mode (10.7.12), magnet (10.7.16),
 * Remove menu + confirm (10.7.17), remembered tools, shortcuts in the menus (10.7.15), keyboard
 * menus (10.7.18).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { LeftToolbar } from '@/components/dashboard/LeftToolbar';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const button = (name: string) => screen.getByRole('button', { name });
const slotOf = (name: string) => button(name).closest('.toolbar-slot');

describe('LeftToolbar — stay in drawing mode', () => {
  it('[10.7.12] should sit right above Remove and show its state', () => {
    const { rerender } = render(<LeftToolbar stayInDrawingMode={false} />);
    const stay = button('Stay in drawing mode');
    expect(stay.getAttribute('aria-pressed')).toBe('false');
    expect(stay.getAttribute('data-tooltip')).toBe('Stay in drawing mode');
    expect(slotOf('Stay in drawing mode')?.nextElementSibling).toBe(slotOf('Remove drawings'));

    rerender(<LeftToolbar stayInDrawingMode />);
    expect(stay.getAttribute('aria-pressed')).toBe('true');
    expect(stay.classList.contains('active')).toBe(true);
    expect(stay.getAttribute('data-tooltip')).toBe('Stay in drawing mode: on');
  });

  it('[10.7.12] should flip the switch on click without arming or disarming a tool', () => {
    const onStay = vi.fn();
    const onTool = vi.fn();
    render(
      <LeftToolbar
        stayInDrawingMode={false}
        onStayInDrawingModeChange={onStay}
        onToolChange={onTool}
        activeToolType="trend-line"
      />
    );
    fireEvent.click(button('Stay in drawing mode'));
    expect(onStay).toHaveBeenCalledWith(true);
    expect(onTool).not.toHaveBeenCalled();
  });
});

describe('LeftToolbar — magnet', () => {
  it('[10.7.16] should sit above Stay in drawing mode and toggle on and off, keeping its strength', () => {
    const onMagnet = vi.fn();
    const { rerender } = render(
      <LeftToolbar magnet={{ on: false, mode: 'strong' }} onMagnetChange={onMagnet} />
    );
    expect(slotOf('Magnet')?.nextElementSibling).toBe(slotOf('Stay in drawing mode'));
    fireEvent.click(button('Magnet'));
    expect(onMagnet).toHaveBeenLastCalledWith({ on: true, mode: 'strong' });

    rerender(<LeftToolbar magnet={{ on: true, mode: 'strong' }} onMagnetChange={onMagnet} />);
    expect(button('Magnet').getAttribute('aria-pressed')).toBe('true');
    expect(button('Magnet').getAttribute('data-tooltip')).toBe('Magnet: Strong magnet');
    fireEvent.click(button('Magnet'));
    expect(onMagnet).toHaveBeenLastCalledWith({ on: false, mode: 'strong' });
  });

  it('[10.7.16] should pick Weak or Strong from its caret, turning it on', () => {
    const onMagnet = vi.fn();
    render(<LeftToolbar magnet={{ on: false, mode: 'weak' }} onMagnetChange={onMagnet} />);
    fireEvent.click(button('Magnet strength'));
    const menu = screen.getByRole('menu', { name: 'Magnet' });
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Strong magnet/ }));
    expect(onMagnet).toHaveBeenCalledWith({ on: true, mode: 'strong' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('LeftToolbar — Remove', () => {
  it('[10.7.17] should list Remove N drawings and the Eraser, and remove only after the confirm', () => {
    const onRemove = vi.fn();
    render(
      <LeftToolbar getDrawingCounts={() => ({ total: 5, hidden: 0 })} onRemoveDrawings={onRemove} />
    );
    fireEvent.click(button('Remove drawings'));
    const menu = screen.getByRole('menu', { name: 'Remove' });
    expect(within(menu).getByRole('menuitemradio', { name: /Eraser/ })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Remove 5 drawings/ }));
    expect(onRemove).not.toHaveBeenCalled();

    const dialog = screen.getByRole('alertdialog', { name: 'Remove 5 drawings?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(button('Remove drawings'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove 5 drawings/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('[10.7.17] should disable Remove with no drawings, and offer Show hidden when some are hidden', () => {
    const onShow = vi.fn();
    render(
      <LeftToolbar
        getDrawingCounts={() => ({ total: 0, hidden: 0 })}
        onShowHiddenDrawings={onShow}
      />
    );
    fireEvent.click(button('Remove drawings'));
    expect(
      (screen.getByRole('menuitem', { name: /Remove 0 drawings/ }) as HTMLButtonElement).disabled
    ).toBe(true);
    cleanup();

    render(
      <LeftToolbar
        getDrawingCounts={() => ({ total: 3, hidden: 1 })}
        onShowHiddenDrawings={onShow}
      />
    );
    fireEvent.click(button('Remove drawings'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Show 1 drawing hidden/ }));
    expect(onShow).toHaveBeenCalled();
  });

  it('[10.7.17] should open the same menu on a right-click of the bin', () => {
    render(<LeftToolbar getDrawingCounts={() => ({ total: 2, hidden: 0 })} />);
    fireEvent.contextMenu(button('Remove drawings'));
    expect(screen.getByRole('menuitem', { name: /Remove 2 drawings/ })).toBeTruthy();
  });

  it('[10.7.17] should cancel the confirm with Escape', () => {
    const onRemove = vi.fn();
    render(
      <LeftToolbar getDrawingCounts={() => ({ total: 1, hidden: 0 })} onRemoveDrawings={onRemove} />
    );
    fireEvent.click(button('Remove drawings'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove 1 drawing$/ }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
  });
});

describe('LeftToolbar — tool groups', () => {
  it('[10.7.15] should show TradingView’s shortcuts in the flyout rows and the button tooltip', () => {
    render(<LeftToolbar />);
    expect(button('Trend Line').getAttribute('data-tooltip')).toMatch(/^Trend Line · (Alt\+T|⌥T)$/);
    fireEvent.click(button('Trend Lines tools'));
    const row = screen.getByRole('menuitemradio', { name: /Horizontal Line/ });
    expect(row.querySelector('kbd')?.textContent).toMatch(/^(Alt\+H|⌥H)$/);
  });

  it('should remember the last tool of a group across a reload', () => {
    const onTool = vi.fn();
    render(<LeftToolbar onToolChange={onTool} />);
    fireEvent.click(button('Fib & Gann tools'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Gann Box/ }));
    expect(onTool).toHaveBeenLastCalledWith('gann-box');
    cleanup();

    render(<LeftToolbar onToolChange={onTool} />);
    fireEvent.click(button('Gann Box'));
    expect(onTool).toHaveBeenLastCalledWith('gann-box');
  });

  it('should arm the tool the dashboard gives a group (the last one used, a shortcut included)', () => {
    const onTool = vi.fn();
    render(
      <LeftToolbar
        onToolChange={onTool}
        activeToolType="horizontal-ray"
        subTools={{ 'trend-lines': 'horizontal-ray' }}
      />
    );
    expect(button('Horizontal Ray').classList.contains('active')).toBe(true);
    fireEvent.click(button('Horizontal Ray'));
    expect(onTool).toHaveBeenCalledWith('horizontal-ray');
  });

  it('should ignore a saved tool that is not in its group', () => {
    localStorage.setItem(
      'cd-drawing-subtools',
      JSON.stringify({ 'trend-lines': 'fib-retracement' })
    );
    render(<LeftToolbar />);
    expect(button('Trend Line')).toBeTruthy();
  });

  it('should arm the Eraser from the cursor menu, as TradingView does', () => {
    const onTool = vi.fn();
    const onCursor = vi.fn();
    render(<LeftToolbar onToolChange={onTool} onCursorVariantChange={onCursor} />);
    fireEvent.click(button('Change cursor style'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Eraser/ }));
    expect(onTool).toHaveBeenLastCalledWith('eraser');
    expect(onCursor).not.toHaveBeenCalled();
  });
});

describe('LeftToolbar — keyboard menus', () => {
  it('[10.7.18] should open on the chosen row, move with the arrows, close with Escape back to the caret', () => {
    render(<LeftToolbar activeToolType="ray" />);
    const caret = button('Trend Lines tools');
    expect(caret.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(caret);
    expect(caret.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu', { name: 'Trend Lines tools' });
    expect(document.activeElement?.textContent).toMatch(/^Ray/);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toMatch(/^Info Line/);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toMatch(/^Trend Line/);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button('Trend Lines tools').previousElementSibling);
  });
});
