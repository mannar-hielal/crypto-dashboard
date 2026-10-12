import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

async function frame() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
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
    expect(bubble.textContent).toContain('Step 1 of 5');
    expect(bubble.textContent).toContain('live price');
    expect(document.querySelector('[data-tour-ring]')).not.toBeNull();
  });

  it('should move on with Next on a reading step, and back', async () => {
    addControl('symbolbar.price');
    addControl('symbolbar.symbol-picker');
    useTourStore.getState().start('primer');
    render(<GuideOverlay />);
    await frame();

    fireEvent.click(screen.getByText('Next →'));
    expect(useTourStore.getState().stepIndex).toBe(1);
    await frame();
    fireEvent.click(screen.getByText('← Back'));
    expect(useTourStore.getState().stepIndex).toBe(0);
  });

  it('should say what to open when the control is not on screen, and still let a reading step go on', async () => {
    useTourStore.getState().start('primer');
    useTourStore.setState({ stepIndex: 3 }); // the balance
    render(<GuideOverlay />);
    await frame();

    expect(document.body.textContent).toContain('Open the account panel');
    expect(document.querySelector('[data-tour-ring]')).toBeNull();
    expect((screen.getByText('Next →') as HTMLButtonElement).disabled).toBe(false);
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

  it('should show a hand-off button label on the last primer step', async () => {
    addControl('trade.side.buy');
    useTourStore.getState().start('primer');
    useTourStore.setState({ stepIndex: 4 });
    render(<GuideOverlay />);
    await frame();

    fireEvent.click(screen.getByText('Start my first trade'));
    expect(useTourStore.getState().activeId).toBe('buy-first-coin');
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
