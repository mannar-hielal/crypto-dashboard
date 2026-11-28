import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

import { GuideOverlay } from '@/guide/GuideOverlay';
import { useTourStore } from '@/guide/tourStore';
import { guideSelector } from '@/lib/guideAnchors';
import { SwapDock } from '@/practice/SwapDock';
import { BLOCK_WAIT_MS } from '@/practice/SwapPanel';
import { useSwapStore } from '@/practice/swapStore';
import { leaveSwapGuide } from '@/practice/leaveSwapGuide';
import { useOrderPrefillStore } from '@/store/orderPrefillStore';

const el = (...a: Parameters<typeof guideSelector>) =>
  document.querySelector<HTMLElement>(guideSelector(...a));
const tick = (ms = 50) => act(() => vi.advanceTimersByTime(ms));
/** A press the learner makes, then the guide's own move on */
const press = (...a: Parameters<typeof guideSelector>) => {
  fireEvent.click(el(...a)!);
  tick();
};
const at = () => `${useTourStore.getState().activeId}.${useTourStore.getState().stepIndex + 1}`;

describe('SwapDock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTourStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('should show nothing unless the swap’s guide runs', () => {
    useTourStore.getState().start('find-the-fee');
    render(<SwapDock narrow={false} />);
    expect(el('swap.panel')).toBeNull();
  });

  it('should end the guide from the panel’s ✕, which takes the panel away', () => {
    useTourStore.getState().start('try-a-swap');
    render(<SwapDock narrow />);
    press('swap.close');
    expect(useTourStore.getState().activeId).toBeNull();
    expect(el('swap.panel')).toBeNull();
  });

  it('should walk the whole stop with the guide: swap, look, revoke, done', () => {
    useTourStore.getState().start('try-a-swap');
    render(
      <>
        <SwapDock narrow={false} />
        <GuideOverlay />
      </>
    );
    press('swap.connect');
    expect(at()).toBe('try-a-swap.2');
    press('swap.review');
    expect(at()).toBe('try-a-swap.3');
    // A no is never a dead end: the same step waits, and the request can be shown again
    press('swap.reject');
    expect(at()).toBe('try-a-swap.3');
    press('swap.ask-again');
    fireEvent.click(el('swap.limit', 'unlimited')!.querySelector('input')!);
    press('swap.sign');
    expect(at()).toBe('try-a-swap.4');
    press('swap.sign');
    // The swap signed: the stop is done, and its look begins
    expect(useTourStore.getState().completed['try-a-swap']).toBe(true);
    expect(at()).toBe('review-swap.1');
    tick(BLOCK_WAIT_MS);
    press('swap.tab', 'wallet');
    for (let i = 0; i < 3; i++) press('tour.next');
    expect(at()).toBe('review-swap.5');
    press('swap.revoke');
    expect(at()).toBe('review-swap-clean.1');
    press('swap.sign');
    expect(useSwapStore.getState().revoked).toEqual(['swap']);
    press('tour.next');
    expect(useTourStore.getState().activeId).toBeNull();
    expect(el('swap.panel')).toBeNull();
  });

  it('should start each run of the stop on a fresh wallet, one restarted mid-way too (review)', () => {
    useTourStore.getState().start('try-a-swap');
    render(<SwapDock narrow={false} />);
    press('swap.connect');
    act(() => useTourStore.getState().start('try-a-swap'));
    expect(useSwapStore.getState().connected).toBe(false);
    expect(el('swap.connect')).not.toBeNull();
  });

  it('should leave the guide when the order form is wanted: a prefill (review)', () => {
    useTourStore.getState().start('try-a-swap');
    render(<SwapDock narrow={false} />);
    act(() => useOrderPrefillStore.setState((s) => ({ seq: s.seq + 1 })));
    expect(useTourStore.getState().activeId).toBeNull();
    // Another tour is left alone
    act(() => useTourStore.getState().start('find-the-fee'));
    act(() => leaveSwapGuide());
    expect(useTourStore.getState().activeId).toBe('find-the-fee');
  });

  it('should leave Esc on a request to the request: the guide stays', () => {
    useTourStore.getState().start('try-a-swap');
    render(
      <>
        <SwapDock narrow={false} />
        <GuideOverlay />
      </>
    );
    press('swap.connect');
    press('swap.review');
    fireEvent.keyDown(el('swap.request')!, { key: 'Escape' });
    tick();
    expect(useTourStore.getState().activeId).toBe('try-a-swap');
    expect(useSwapStore.getState().rejected).toBe(true);
  });
});
