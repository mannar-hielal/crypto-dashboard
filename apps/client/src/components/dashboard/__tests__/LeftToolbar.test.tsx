/**
 * LeftToolbar — the "Stay in drawing mode" switch (TRADING_TEST_PLAN 10.7.12).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LeftToolbar } from '@/components/dashboard/LeftToolbar';

afterEach(cleanup);

const stayButton = () => screen.getByRole('button', { name: 'Stay in drawing mode' });

describe('LeftToolbar — stay in drawing mode', () => {
  it('[10.7.12] should sit right above Remove All and show its state', () => {
    const { rerender } = render(<LeftToolbar stayInDrawingMode={false} />);
    expect(stayButton().getAttribute('aria-pressed')).toBe('false');
    expect(stayButton().getAttribute('data-tooltip')).toBe('Stay in drawing mode');
    const next = stayButton().closest('.toolbar-slot')?.nextElementSibling;
    expect(next?.contains(screen.getByRole('button', { name: 'Remove All' }))).toBe(true);

    rerender(<LeftToolbar stayInDrawingMode />);
    expect(stayButton().getAttribute('aria-pressed')).toBe('true');
    expect(stayButton().classList.contains('active')).toBe(true);
    expect(stayButton().getAttribute('data-tooltip')).toBe('Stay in drawing mode: on');
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
    fireEvent.click(stayButton());
    expect(onStay).toHaveBeenCalledWith(true);
    expect(onTool).not.toHaveBeenCalled();
  });
});
