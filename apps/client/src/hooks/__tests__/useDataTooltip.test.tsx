import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useDataTooltip, type TooltipPlacement } from '@/hooks/useDataTooltip';

function Bar({ placement, delayMs }: { placement: TooltipPlacement; delayMs?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const tooltip = useDataTooltip(ref, placement, delayMs);
  return (
    <div ref={ref}>
      <button type="button" data-tooltip="Trend line">
        tool
      </button>
      <button type="button" data-tooltip="Synced" data-tooltip-delay="300">
        sync
      </button>
      <span>plain</span>
      {tooltip}
    </div>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useDataTooltip', () => {
  it('should show the tooltip after the default 1.5 s hover delay', () => {
    render(<Bar placement="right" />);
    fireEvent.mouseOver(screen.getByText('tool'));
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip').textContent).toBe('Trend line');
  });

  it('should take the container’s own default delay (the drawing toolbar’s 400 ms)', () => {
    render(<Bar placement="right" delayMs={400} />);
    fireEvent.mouseOver(screen.getByText('tool'));
    act(() => vi.advanceTimersByTime(399));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip').textContent).toBe('Trend line');
  });

  it('should honour data-tooltip-delay', () => {
    render(<Bar placement="bottom-end" />);
    fireEvent.mouseOver(screen.getByText('sync'));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip').textContent).toBe('Synced');
  });

  it('should hide when the pointer moves off a tooltip element or leaves the container', () => {
    render(<Bar placement="right" />);
    fireEvent.mouseOver(screen.getByText('sync'));
    act(() => vi.advanceTimersByTime(300));
    fireEvent.mouseOver(screen.getByText('plain'));
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseOver(screen.getByText('sync'));
    act(() => vi.advanceTimersByTime(300));
    fireEvent.mouseLeave(screen.getByText('plain').parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('should keep a right-placed tooltip on one line and let a bottom one wrap', () => {
    const { unmount } = render(<Bar placement="right" />);
    fireEvent.mouseOver(screen.getByText('sync'));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip').className).toContain('whitespace-nowrap');
    unmount();

    render(<Bar placement="bottom-end" />);
    fireEvent.mouseOver(screen.getByText('sync'));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip').className).toContain('max-w-64');
  });
});
