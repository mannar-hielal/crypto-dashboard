import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { guideSelector } from '@/lib/guideAnchors';
import {
  NETWORK_FEE_ETH,
  POOL,
  quoteSwap,
  START_BALANCES,
  SWAP_AMOUNTS,
} from '@/practice/swapMath';
import { covers, isOpen, useSwapStore } from '@/practice/swapStore';
import { BLOCK_WAIT_MS, SwapPanel } from '@/practice/SwapPanel';

const s = () => useSwapStore.getState();
const el = (...a: Parameters<typeof guideSelector>) =>
  document.querySelector<HTMLElement>(guideSelector(...a));
const click = (...a: Parameters<typeof guideSelector>) => fireEvent.click(el(...a)!);

describe('quoteSwap', () => {
  it('should price a swap by x × y = k, with the pool fee taken from what is put in', () => {
    const q = quoteSwap(100);
    expect(q.poolFee).toBeCloseTo(0.3, 10);
    expect(q.get).toBeCloseTo((10 * 99.7) / (20_000 + 99.7), 12);
    expect(q.get).toBeCloseTo(0.0496, 4);
    // The pool's product never falls: the fee stays in it
    expect((POOL.eth - q.get) * (POOL.usdc + 100)).toBeGreaterThanOrEqual(POOL.eth * POOL.usdc);
  });

  it('should accept no less than half a percent under the quote', () => {
    const q = quoteSwap(100);
    expect(q.minimum).toBeCloseTo(q.get * 0.995, 12);
  });

  it('should give a bigger swap a bigger price impact', () => {
    const [small, big] = SWAP_AMOUNTS.map((n) => quoteSwap(n));
    expect(small.priceImpact).toBeCloseTo(99.7 / 20_099.7, 12);
    expect(big.priceImpact).toBeGreaterThan(small.priceImpact);
    expect(big.get).toBeLessThan(2 * small.get);
  });
});

describe('the practice wallet', () => {
  beforeEach(() => s().reset());

  it('should start with an old permission still open, and nothing connected', () => {
    expect(s().connected).toBe(false);
    expect([s().usdc, s().eth]).toEqual([START_BALANCES.usdc, START_BALANCES.eth]);
    expect(s().allowances).toEqual({ game: 'unlimited' });
  });

  it('should ask for nothing before it is connected', () => {
    s().review();
    expect(s().request).toBeNull();
  });

  it('should ask for the permission first, then the swap, then settle after the block', () => {
    s().connect();
    s().review();
    expect(s().request).toEqual({ kind: 'approve', amount: 100 });
    s().sign();
    expect(s().allowances.swap).toBe(100);
    expect(s().request?.kind).toBe('swap');
    s().sign();
    expect(s().phase).toBe('waiting');
    // Nothing moves until the block, but the network fees are paid
    expect(s().usdc).toBe(500);
    expect(s().eth).toBeCloseTo(0.02 - 2 * NETWORK_FEE_ETH, 12);
    s().confirm();
    expect(s().phase).toBe('done');
    expect(s().usdc).toBe(400);
    expect(s().eth).toBeCloseTo(0.02 - 2 * NETWORK_FEE_ETH + quoteSwap(100).get, 12);
    // Only this amount: used up
    expect(s().allowances.swap).toBe(0);
    expect(isOpen(s().allowances.swap)).toBe(false);
  });

  it('should leave a no-limit permission open after the swap, until it is revoked', () => {
    s().connect();
    s().setLimit('unlimited');
    s().review();
    s().sign();
    s().sign();
    s().confirm();
    expect(s().allowances.swap).toBe('unlimited');
    s().askRevoke('swap');
    expect(s().request).toEqual({ kind: 'revoke', app: 'swap' });
    s().sign();
    expect(s().allowances.swap).toBe(0);
    expect(s().revoked).toEqual(['swap']);
    expect(s().receipt!.networkFees).toBeCloseTo(2 * NETWORK_FEE_ETH, 12);
  });

  it('should change nothing on Reject, and ask again', () => {
    s().connect();
    s().review();
    s().reject();
    expect(s().rejected).toBe(true);
    s().sign(); // a rejected request can't be signed
    expect([s().eth, s().allowances.swap]).toEqual([START_BALANCES.eth, undefined]);
    s().askAgain();
    s().sign();
    expect(s().allowances.swap).toBe(100);
  });

  it('should not offer to revoke a permission that can take nothing', () => {
    s().askRevoke('swap');
    expect(s().request).toBeNull();
    expect(covers(undefined, 1)).toBe(false);
    expect(covers(100, 200)).toBe(false);
    expect(covers('unlimited', 200)).toBe(true);
  });
});

describe('SwapPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    s().reset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const walkToRequest = () => {
    click('swap.connect');
    click('swap.review');
  };

  it('should say it is practice only, and offer no field that takes text (🔐 no address, no phrase)', () => {
    render(<SwapPanel onClose={() => {}} />);
    const noText = () =>
      expect(
        document.querySelectorAll('textarea, input:not([type="radio"]), [contenteditable]')
      ).toHaveLength(0);
    expect(screen.getByText(/Practice only: nothing here is real/)).toBeTruthy();
    noText();
    walkToRequest();
    noText();
    click('swap.sign');
    noText();
    click('swap.tab', 'wallet');
    noText();
  });

  it('should show the wallet’s request as a dialog that has the focus, with a dot and words on Wallet', () => {
    render(<SwapPanel onClose={() => {}} />);
    walkToRequest();
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement?.textContent).toBe('Your wallet asks');
    expect(el('swap.tab', 'wallet')!.textContent).toContain('wants an answer');
    expect(document.getElementById('swap-view')!.hasAttribute('inert')).toBe(true);
    // Esc says no, and stays inside: the tour under it never hears it
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    window.removeEventListener('keydown', outside);
    expect(outside).not.toHaveBeenCalled();
    expect(screen.getByText(/Rejected: this request did nothing/)).toBeTruthy();
    expect(el('swap.tab', 'wallet')!.textContent).not.toContain('wants an answer');
    click('swap.ask-again');
    expect(el('swap.sign')).not.toBeNull();
  });

  it('should keep Tab inside the request', () => {
    render(<SwapPanel onClose={() => {}} />);
    walkToRequest();
    const sign = el('swap.sign')!;
    sign.focus();
    fireEvent.keyDown(sign, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('dialog').querySelector('input, button'));
  });

  it('should swap, confirm after the block, and revoke on the Wallet tab', () => {
    render(<SwapPanel onClose={() => {}} />);
    walkToRequest();
    fireEvent.click(el('swap.limit', 'unlimited')!.querySelector('input')!);
    click('swap.sign'); // the permission
    click('swap.sign'); // the swap
    expect(el('swap.status')!.textContent).toMatch(/Waiting for a block/);
    act(() => vi.advanceTimersByTime(BLOCK_WAIT_MS));
    expect(el('swap.status')!.textContent).toMatch(/Confirmed/);
    click('swap.tab', 'wallet');
    expect(el('swap.receipt')!.textContent).toMatch(/Pool fee.*0\.30 USDC.*Price impact.*0\.50%/);
    // The app's permission first: the tour's ring lands on it
    expect(el('swap.revoke')!.getAttribute('data-guide-key')).toBe('swap');
    click('swap.revoke', 'swap');
    click('swap.sign');
    expect(el('swap.permissions')!.textContent).toMatch(
      /Practice Swap.*Revoked: it cannot take your USDC/
    );
    expect(el('swap.revoke')!.getAttribute('data-guide-key')).toBe('game');
  });

  it('should give the focus back when a request closes: the button, or the panel’s heading', () => {
    render(<SwapPanel onClose={() => {}} />);
    click('swap.connect');
    const review = el('swap.review')!;
    review.focus();
    fireEvent.click(review);
    click('swap.sign'); // the permission: the swap's own request follows in the same sheet
    expect(document.activeElement?.textContent).toBe('Your wallet asks');
    click('swap.sign'); // the swap: the button that asked is gone now
    expect(document.activeElement?.textContent).toBe('Practice swap');
    // A revoke's button is gone once it is signed too, and a heading takes the focus
    act(() => vi.advanceTimersByTime(BLOCK_WAIT_MS));
    click('swap.tab', 'wallet');
    const revoke = el('swap.revoke', 'game')!;
    revoke.focus();
    fireEvent.click(revoke);
    click('swap.sign');
    expect(document.activeElement?.textContent).toBe('Practice swap');
  });

  it('should keep the focus on the panel once Connect is gone', () => {
    render(<SwapPanel onClose={() => {}} />);
    const connect = el('swap.connect')!;
    connect.focus();
    fireEvent.click(connect);
    expect(document.activeElement?.textContent).toBe('Practice swap');
  });

  it('should say a no to the swap leaves the permission signed before it (fact check)', () => {
    render(<SwapPanel onClose={() => {}} />);
    walkToRequest();
    click('swap.reject');
    expect(screen.queryByText(/permission you signed before/)).toBeNull();
    click('swap.ask-again');
    click('swap.sign');
    click('swap.reject');
    expect(screen.getByRole('dialog').textContent).toContain(
      'The permission you signed before is still there.'
    );
  });

  it('should keep the swap’s own fees on its receipt, a later revoke aside (fact check)', () => {
    render(<SwapPanel onClose={() => {}} />);
    walkToRequest();
    click('swap.sign');
    click('swap.sign');
    act(() => vi.advanceTimersByTime(BLOCK_WAIT_MS));
    click('swap.tab', 'wallet');
    const fees = /Network fees.*0\.0002 ETH/;
    expect(el('swap.receipt')!.textContent).toMatch(fees);
    click('swap.revoke', 'game');
    click('swap.sign');
    expect(el('swap.receipt')!.textContent).toMatch(fees);
  });

  it('should keep Tab in from any radio or the sheet itself, and let it go once refused (review)', () => {
    render(<SwapPanel onClose={() => {}} />);
    walkToRequest();
    const dialog = screen.getByRole('dialog');
    const noLimit = el('swap.limit', 'unlimited')!.querySelector('input')!;
    fireEvent.click(noLimit);
    noLimit.focus();
    // The checked radio is the group's one stop: Shift+Tab from it wraps to Sign
    fireEvent.keyDown(noLimit, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(el('swap.sign'));
    // A click on the sheet's words leaves the focus inside, so Esc still means no
    expect(dialog.getAttribute('tabindex')).toBe('-1');
    dialog.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(el('swap.sign'));
    click('swap.reject');
    const again = el('swap.ask-again')!;
    again.focus();
    // Nothing is waiting any more: Tab is not held
    expect(fireEvent.keyDown(again, { key: 'Tab' })).toBe(true);
    // The swap's own request has no Close: the guide asks for a signature
    expect(el('swap.dismiss')).toBeNull();
  });

  it('should let a refused revoke be closed, nothing signed (review)', () => {
    render(<SwapPanel onClose={() => {}} />);
    click('swap.connect');
    click('swap.tab', 'wallet');
    click('swap.revoke', 'game');
    click('swap.reject');
    click('swap.dismiss');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(s().allowances.game).toBe('unlimited');
    expect(s().eth).toBe(START_BALANCES.eth);
  });

  it('should keep the wallet when the panel comes back (review)', () => {
    const view = render(<SwapPanel onClose={() => {}} />);
    click('swap.connect');
    view.unmount();
    render(<SwapPanel onClose={() => {}} />);
    expect(s().connected).toBe(true);
  });

  it('should move between the tabs with the arrow keys', () => {
    render(<SwapPanel onClose={() => {}} />);
    fireEvent.keyDown(el('swap.tab', 'app')!, { key: 'ArrowRight' });
    expect(el('swap.tab', 'wallet')!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(el('swap.tab', 'wallet'));
  });

  it('should close from its ✕', () => {
    const onClose = vi.fn();
    render(<SwapPanel onClose={onClose} />);
    click('swap.close');
    expect(onClose).toHaveBeenCalled();
  });
});
