import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { registerNewestCandle, reportHover } from '@/guide/chartHover';
import { GuideOverlay } from '@/guide/GuideOverlay';
import { useTourStore } from '@/guide/tourStore';

/** A control on the page: jsdom has no layout, so give it a box */
function addControl(
  anchor: string,
  opts: { tag?: 'button' | 'input'; key?: string; value?: string } = {}
) {
  const el = document.createElement(opts.tag ?? 'button');
  el.setAttribute('data-guide', anchor);
  if (opts.key) el.setAttribute('data-guide-key', opts.key);
  if (el instanceof HTMLInputElement && opts.value !== undefined) el.value = opts.value;
  el.getBoundingClientRect = () =>
    ({
      top: 100,
      left: 200,
      width: 120,
      height: 32,
      right: 320,
      bottom: 132,
      x: 200,
      y: 100,
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

async function frame(ms = 40) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** The chart's crosshair reports a candle (ChartPanel does this for real) */
function hover(bar: { open: number; close: number; isLast: boolean } | null) {
  act(() => reportHover(bar && { time: 1_700_000_000, ...bar }));
}

describe('GuideOverlay', () => {
  beforeEach(() => {
    useTourStore.getState().reset();
    document.body.innerHTML = '';
  });
  afterEach(() => cleanup());

  it('should render nothing while no tour runs', () => {
    render(<GuideOverlay />);
    expect(document.querySelector('[data-guide="tour.bubble"]')).toBeNull();
  });

  it('should show step 1 of the primer with a ring on the control', async () => {
    addControl('symbolbar.price');
    useTourStore.getState().start('primer');
    render(<GuideOverlay />);
    await frame();

    const bubble = document.querySelector('[data-guide="tour.bubble"]')!;
    expect(bubble.textContent).toContain('Step 1 of 3');
    expect(bubble.textContent).toContain('Tap the live price');
    expect(document.querySelector('[data-tour-ring]')).not.toBeNull();
  });

  it('should move on with Next on a reading step, and back', async () => {
    addControl('trade.side.buy');
    addControl('trade.type.market');
    useTourStore.getState().start('buy-first-coin');
    render(<GuideOverlay />);
    await frame();

    fireEvent.click(screen.getByText('Next →'));
    expect(useTourStore.getState().stepIndex).toBe(1);
    await frame();
    fireEvent.click(screen.getByText('← Back'));
    expect(useTourStore.getState().stepIndex).toBe(0);
  });

  it('should say what to open when the control is not on screen, and still let a reading step go on', async () => {
    useTourStore.getState().start('buy-first-coin'); // step 1 reads the Buy side of the form
    render(<GuideOverlay />);
    await frame();

    expect(document.body.textContent).toContain('Open the order form');
    expect(document.querySelector('[data-tour-ring]')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('[data-guide="tour.next"]')!.disabled).toBe(
      false
    );
  });

  it('should advance a click step on a click of its control only', async () => {
    addControl('trade.type.market');
    const other = addControl('trade.type.limit');
    useTourStore.getState().start('buy-first-coin');
    useTourStore.setState({ stepIndex: 1 }); // choose Market
    render(<GuideOverlay />);
    await frame();

    fireEvent.click(other);
    await frame();
    expect(useTourStore.getState().stepIndex).toBe(1);

    fireEvent.click(document.querySelector('[data-guide="trade.type.market"]')!);
    await frame();
    expect(useTourStore.getState().stepIndex).toBe(2);
  });

  it('should mark an action step with a pulsing ring, an arrow and a Your turn tag', async () => {
    addControl('trade.type.market');
    useTourStore.getState().start('buy-first-coin');
    useTourStore.setState({ stepIndex: 1 }); // choose Market (a click step)
    render(<GuideOverlay />);
    await frame();

    expect(document.querySelector('[data-tour-ring]')!.className).toContain('ringAction');
    // beside the control (free space), never over the text above it
    expect(document.querySelector('[data-tour-arrow]')!.getAttribute('data-tour-arrow')).toBe(
      'left'
    );
    expect(document.querySelector('[data-guide="tour.bubble"]')!.textContent).toContain(
      'Your turn'
    );
  });

  it('should leave a reading step with a still ring, no arrow and no tag', async () => {
    addControl('trade.side.buy');
    useTourStore.getState().start('buy-first-coin');
    render(<GuideOverlay />);
    await frame();

    expect(document.querySelector('[data-tour-ring]')!.className).not.toContain('ringAction');
    expect(document.querySelector('[data-tour-arrow]')).toBeNull();
    expect(document.querySelector('[data-guide="tour.bubble"]')!.textContent).not.toContain(
      'Your turn'
    );
  });

  it('should keep Next off a type step until the field has a value', async () => {
    const input = addControl('trade.amount', { tag: 'input', value: '' });
    useTourStore.getState().start('buy-first-coin');
    useTourStore.setState({ stepIndex: 3 }); // type 100
    render(<GuideOverlay />);
    await frame();

    const next = screen.getByText('Next →') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    (input as HTMLInputElement).value = '100';
    await frame();
    expect((screen.getByText('Next →') as HTMLButtonElement).disabled).toBe(false);
  });

  it('should finish the submit step only once the amount field is emptied', async () => {
    const submit = addControl('trade.submit');
    const amount = addControl('trade.amount', { tag: 'input', value: '100' }) as HTMLInputElement;
    useTourStore.getState().start('buy-first-coin');
    useTourStore.setState({ stepIndex: 4 });
    render(<GuideOverlay />);
    await frame();

    fireEvent.click(submit);
    await frame();
    // Still waiting: the form has not cleared the field
    expect(useTourStore.getState().activeId).toBe('buy-first-coin');
    expect(document.body.textContent).toContain('Waiting for the order');

    amount.value = '';
    await frame();
    await frame();
    // Finished the tour: handed over to the next chapter
    expect(useTourStore.getState().activeId).toBe('sell-and-review');
    expect(useTourStore.getState().completed['buy-first-coin']).toBe(true);
  });

  it('should not advance when the order is refused (the field keeps its value)', async () => {
    const submit = addControl('trade.submit');
    addControl('trade.amount', { tag: 'input', value: '100' });
    useTourStore.getState().start('buy-first-coin');
    useTourStore.setState({ stepIndex: 4 });
    render(<GuideOverlay />);
    await frame();

    fireEvent.click(submit);
    await frame();
    await frame();
    expect(useTourStore.getState().stepIndex).toBe(4);
  });

  it('should close on Skip tour and on Escape', async () => {
    addControl('symbolbar.price');
    useTourStore.getState().start('primer');
    render(<GuideOverlay />);
    await frame();
    fireEvent.click(screen.getByText('Skip tour'));
    expect(useTourStore.getState().activeId).toBeNull();

    cleanup();
    useTourStore.getState().start('primer');
    render(<GuideOverlay />);
    await frame();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useTourStore.getState().activeId).toBeNull();
  });

  it('should grade the quiz, explain it, and finish the tour', async () => {
    useTourStore.getState().start('sell-and-review');
    useTourStore.setState({ stepIndex: 4 });
    render(<GuideOverlay />);
    await frame();

    expect((screen.getByText('Finish') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Yes, the price went up'));
    expect(document.body.textContent).toContain('Not quite.');
    expect(document.body.textContent).toContain('0.2%');
    fireEvent.click(screen.getByText('Finish'));
    expect(useTourStore.getState().completed['sell-and-review']).toBe(true);
    expect(useTourStore.getState().activeId).toBeNull();
  });

  it('should show a step’s own button label, and finish the primer without handing over', async () => {
    useTourStore.getState().start('sell-and-review');
    useTourStore.setState({ stepIndex: 3 }); // the centred "done" card
    render(<GuideOverlay />);
    await frame();
    fireEvent.click(screen.getByText('One quick question'));
    expect(useTourStore.getState().stepIndex).toBe(4);

    cleanup();
    addControl('pane.chart');
    useTourStore.getState().start('primer');
    useTourStore.setState({ stepIndex: 2 }); // find a red candle
    render(<GuideOverlay />);
    await frame();
    hover({ open: 100, close: 90, isLast: false });
    await frame(800);
    expect(useTourStore.getState().completed.primer).toBe(true);
    expect(useTourStore.getState().activeId).toBeNull();
  });

  // ── Hover tasks (Lesson 1's "Try it": checked on the real chart) ───────────

  it('should tick a hover task done on the asked-for candle, then move on', async () => {
    addControl('pane.chart');
    useTourStore.getState().start('primer');
    useTourStore.setState({ stepIndex: 2 }); // find a red candle
    render(<GuideOverlay />);
    await frame();

    // An action step: ring, arrow, Your turn; no Next to skip the task
    expect(document.querySelector('[data-tour-ring]')!.className).toContain('ringAction');
    expect(document.querySelector('[data-guide="tour.next"]')).toBeNull();

    hover({ open: 100, close: 110, isLast: false }); // green: not it
    await frame();
    expect(document.querySelector('[data-guide="tour.done"]')).toBeNull();

    hover({ open: 100, close: 90, isLast: false });
    await frame();
    expect(document.querySelector('[data-guide="tour.done"]')!.textContent).toContain('Done ✓');
    expect(useTourStore.getState().stepIndex).toBe(2); // a moment to read it
  });

  it('should need the pointer to rest on the newest candle, not pass over it', async () => {
    addControl('pane.chart');
    useTourStore.getState().start('primer');
    useTourStore.setState({ stepIndex: 1 }); // the newest candle
    render(<GuideOverlay />);
    await frame();

    hover({ open: 1, close: 2, isLast: true });
    await frame(300);
    hover({ open: 1, close: 2, isLast: false }); // moved off before the hold
    await frame(900);
    expect(document.querySelector('[data-guide="tour.done"]')).toBeNull();

    hover({ open: 1, close: 2, isLast: true });
    await frame(1100);
    expect(document.querySelector('[data-guide="tour.done"]')).not.toBeNull();
    await frame(800);
    expect(useTourStore.getState().stepIndex).toBe(2);
  });

  it('should ring the newest candle and point the arrow down at it, not at the whole chart', async () => {
    const chart = addControl('pane.chart');
    const container = document.createElement('div');
    chart.appendChild(container);
    const unregister = registerNewestCandle(container, () => ({
      top: 300,
      left: 900,
      width: 10,
      height: 40,
    }));
    useTourStore.getState().start('primer');
    useTourStore.setState({ stepIndex: 1 });
    render(<GuideOverlay />);
    await frame();

    const ring = document.querySelector<HTMLElement>('[data-tour-ring]')!;
    expect(ring.getAttribute('data-tour-ring')).toBe('candle');
    expect(ring.style.left).toBe('897px'); // the candle, less the ring's padding
    const arrow = document.querySelector<HTMLElement>('[data-tour-arrow]')!;
    expect(arrow.getAttribute('data-tour-arrow')).toBe('above');
    unregister();
  });

  it('should fall back to the whole chart when the newest candle is off screen', async () => {
    const chart = addControl('pane.chart');
    const container = document.createElement('div');
    chart.appendChild(container);
    const unregister = registerNewestCandle(container, () => null);
    useTourStore.getState().start('primer');
    useTourStore.setState({ stepIndex: 1 });
    render(<GuideOverlay />);
    await frame();

    const ring = document.querySelector<HTMLElement>('[data-tour-ring]')!;
    expect(ring.getAttribute('data-tour-ring')).toBe('');
    expect(ring.style.left).toBe('197px');
    unregister();
  });

  it('should not tick the newest candle done when the pointer leaves the chart before the hold', async () => {
    addControl('pane.chart');
    useTourStore.getState().start('primer');
    useTourStore.setState({ stepIndex: 1 });
    render(<GuideOverlay />);
    await frame();

    hover({ open: 1, close: 2, isLast: true });
    await frame(300);
    hover(null); // left the chart
    await frame(1000);
    expect(document.querySelector('[data-guide="tour.done"]')).toBeNull();
    expect(useTourStore.getState().stepIndex).toBe(1);
  });

  it('should let a learner without a mouse skip a hover task', async () => {
    addControl('pane.chart');
    useTourStore.getState().start('primer');
    useTourStore.setState({ stepIndex: 1 });
    render(<GuideOverlay />);
    await frame();
    fireEvent.click(screen.getByText('Skip this step'));
    expect(useTourStore.getState().stepIndex).toBe(2);
  });

  it('should stop listening to the chart once the tour closes', async () => {
    addControl('pane.chart');
    useTourStore.getState().start('primer');
    useTourStore.setState({ stepIndex: 2 });
    render(<GuideOverlay />);
    await frame();
    useTourStore.getState().close();
    await frame();
    const spy = vi.spyOn(useTourStore.getState(), 'next');
    hover({ open: 100, close: 90, isLast: false });
    await frame(800);
    expect(spy).not.toHaveBeenCalled();
  });

  it('should be cleaned up on close: no bubble, no stray listeners that advance later', async () => {
    const market = addControl('trade.type.market');
    useTourStore.getState().start('buy-first-coin');
    useTourStore.setState({ stepIndex: 1 });
    render(<GuideOverlay />);
    await frame();
    useTourStore.getState().close();
    await frame();
    expect(document.querySelector('[data-guide="tour.bubble"]')).toBeNull();
    const spy = vi.spyOn(useTourStore.getState(), 'next');
    fireEvent.click(market);
    expect(spy).not.toHaveBeenCalled();
  });
});
