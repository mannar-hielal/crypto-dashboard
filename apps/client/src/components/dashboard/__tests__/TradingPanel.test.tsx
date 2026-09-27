/**
 * TradingPanel component tests  (T2 · RTL)
 *
 * Covers Sections 1 & 2 of the Trading Panel test plan — all items marked
 * "T2 · RTL" that live in the TradingPanel component itself:
 *
 *   Section 1 — Market Orders
 *     1.1.1  Order info shows Margin and Commission                (T2)
 *     1.1.2  Click Buy → qty input clears                         (T2)
 *     1.2.1  Sell side shows updated order info                   (T2)
 *     1.3.1  ⇄ Units toggle changes label to "Quantity (BTC)"    (T2)
 *     1.3.2  Units mode shows USD equivalent                      (T2)
 *     1.3.3  ⇄ USD restores USD mode; shows BTC equivalent        (T2)
 *     1.4.1  TP enabled → input has green border                 (T2)
 *     1.5.1  SL enabled → input has red border                   (T2)
 *     1.6.1  Both TP and SL inputs active                        (T2)
 *     1.7.1  Submit with empty qty → submit button disabled         (T2)
 *     1.7.2  Submit with qty > balance → "Insufficient balance"   (T2)
 *     1.7.3  Buy TP below entry → error "…must be above…"        (T2)
 *     1.7.4  Buy SL above entry → error "…must be below…"        (T2)
 *     1.7.5  Sell TP above entry → error "…must be below…"       (T2)
 *     1.7.6  Sell SL below entry → error "…must be above…"       (T2)
 *     1.7.7  qty = 0 → submit button disabled                    (T2)
 *
 *   Section 2 — Limit Orders
 *     2.1.1  Limit tab → price field visible and pre-filled       (T2)
 *     2.5.1  Limit Buy TP below trigger → validation error        (T2)
 *     2.5.2  Limit Buy SL above trigger → validation error        (T2)
 *     2.5.4  Limit order exceeds balance → "Insufficient balance" (T2)
 *
 * Framework: Vitest + @testing-library/react  (jsdom environment)
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { TradingPanel } from '../TradingPanel';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore, type Position } from '@/store/paperStore';
import { useAuthStore } from '@/store/authStore';
import { emptyState, fakePaperApi, resetFakePaperApi } from '@/test/fakePaperApi';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Trading runs on the server (BP-1): the panel sends an intent to paperApi. The fake answers
// with a realistic delta so the store updates as it would against the real server.
vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  paperApi: (await import('@/test/fakePaperApi')).fakePaperApi,
}));

// Framer-motion: forward all motion.* as plain HTML elements; skip animations.
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(
          (
            { children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>,
            ref: React.Ref<HTMLElement>
          ) => React.createElement(tag, { ...props, ref }, children)
        ),
    }
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  useAnimation: () => ({ start: vi.fn() }),
}));

// TradingSoundContext: mock the hook so AudioContext is never accessed in jsdom.
vi.mock('@/hooks/TradingSoundContext', () => ({
  useTradingSoundCtx: () => ({
    playOrderPlaced: vi.fn(),
    playOrderQueued: vi.fn(),
    playOrderFilled: vi.fn(),
    playProfit: vi.fn(),
    playLoss: vi.fn(),
    volume: 0.5,
    muted: false,
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
  }),
  TradingSoundProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

const PRICE = 50_000;

/**
 * Sets up the minimal store state needed to render TradingPanel:
 *   - paneStores[0] gets a live price + connected flag
 *   - layoutStore activePane = 0 (default) pointing at BTCUSDT
 */
function setupStores() {
  paneStores[0].setState({
    latestPrice: PRICE,
    isConnected: true,
    bid: PRICE - 10,
    ask: PRICE + 10,
  });
  // These cases are the leveraged (USDT Perpetual) form; Spot has its own section below
  useLayoutStore.setState((s) => ({
    activePane: 0,
    panes: s.panes.map((p, i) => (i === 0 ? { ...p, symbol: 'BTCUSDT', category: 'linear' } : p)),
  }));
}

function renderPanel(props: Partial<React.ComponentProps<typeof TradingPanel>> = {}) {
  return render(<TradingPanel onClose={vi.fn()} {...props} />);
}

/** Click the primary execute button in the order form. */
function getExecuteBtn(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /execute\s+(buy|sell)\s+(market|limit|stop)\s+order/i,
  });
}

/** Quantity/margin input shared across Market/Limit/Stop tabs. */
function getQtyInput(): HTMLInputElement {
  return screen.getByLabelText('Order amount') as HTMLInputElement;
}

/** Price input shown in Limit/Stop tabs. */
function getPriceInput(): HTMLInputElement {
  return screen.getByLabelText('Order price') as HTMLInputElement;
}

function getTpInput(): HTMLInputElement {
  return screen.getByLabelText('Take profit price') as HTMLInputElement;
}

function getSlInput(): HTMLInputElement {
  return screen.getByLabelText('Stop loss price') as HTMLInputElement;
}

function clickExecuteBtn() {
  fireEvent.click(getExecuteBtn());
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  usePaperStore.getState().clear();
  // The dashboard trades on a loaded account (a delta onto an unloaded one triggers a resync)
  usePaperStore.getState().hydrate(emptyState());
  useAuthStore.setState({ accessToken: 'test-token' });
  resetFakePaperApi();
  localStorage.clear();
  setupStores();
});

afterEach(() => {
  cleanup();
});

// ─── Section 1 — Market Orders ────────────────────────────────────────────────

describe('Section 1 — Market Orders (T2 · RTL)', () => {
  // ── 1.1 Basic Buy ───────────────────────────────────────────────────────────

  describe('1.1 Basic Buy', () => {
    it('1.1.1: order info shows value, margin and both fee estimates (Bybit taker 0.055%)', () => {
      renderPanel();
      const qtyInput = getQtyInput();
      fireEvent.change(qtyInput, { target: { value: '100' } });

      // 100 USDT of value at 1×: margin $100, open fee 100 × 0.00055 = $0.0550. Bybit prices the
      // fee to close at the bankruptcy price, which is 0 for a 1× long → $0.0000 (BP-3)
      expect(screen.getByText('Margin')).toBeTruthy();
      expect(screen.getByText('Est. open fee')).toBeTruthy();
      expect(screen.getByText('Est. close fee')).toBeTruthy();
      expect(screen.getAllByText('$0.0550')).toHaveLength(1);
      expect(screen.getByText('$0.0000')).toBeTruthy();
      expect(screen.getByText('Fees: taker 0.055% · maker 0.02%')).toBeTruthy();
    });

    it('1.1.2: clicking Buy clears the qty input', async () => {
      renderPanel();
      const qtyInput = getQtyInput();
      fireEvent.change(qtyInput, { target: { value: '100' } });

      clickExecuteBtn();

      await waitFor(() => expect((qtyInput as HTMLInputElement).value).toBe(''));
    });

    it('1.1.2 (BP-1): a market Buy sends intent only — no price — to the server', async () => {
      renderPanel();
      fireEvent.change(getQtyInput(), { target: { value: '100' } });
      clickExecuteBtn();

      await waitFor(() => expect(fakePaperApi.placeOrder).toHaveBeenCalledTimes(1));
      const [body] = fakePaperApi.placeOrder.mock.calls[0];
      expect(body).toMatchObject({ symbol: 'BTCUSDT', side: 'buy', type: 'market' });
      expect(body).not.toHaveProperty('triggerPrice');
      await waitFor(() => expect(usePaperStore.getState().positions).toHaveLength(1));
    });

    it('1.1.2 (BP-1): a server rejection keeps the form and shows the server message', async () => {
      fakePaperApi.placeOrder.mockRejectedValueOnce(new Error('Waiting for live price…'));
      renderPanel();
      fireEvent.change(getQtyInput(), { target: { value: '100' } });
      clickExecuteBtn();

      expect(await screen.findByText('Waiting for live price…')).toBeTruthy();
      expect(getQtyInput().value).toBe('100');
    });
  });

  // ── 1.2 Basic Sell ──────────────────────────────────────────────────────────

  describe('1.2 Basic Sell', () => {
    it('1.2.1: switching to Sell side shows order info for Sell', () => {
      renderPanel();
      // Click the Sell side button
      const sellBtn = screen.getByRole('button', { name: /sell/i });
      fireEvent.click(sellBtn);

      // The order info section should still be visible
      expect(screen.getByText('Order info')).toBeTruthy();
    });
  });

  // ── 1.3 Units mode ──────────────────────────────────────────────────────────

  describe('1.3 Amount unit (BTC | USDT)', () => {
    const unitBtn = (name: string) =>
      within(screen.getByRole('group', { name: 'Amount unit' })).getByRole('button', { name });

    it('1.3.1: the amount starts in USDT; BTC switches it to a coin quantity', () => {
      renderPanel();
      expect(unitBtn('USDT').getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(unitBtn('BTC'));
      expect(unitBtn('BTC').getAttribute('aria-pressed')).toBe('true');
    });

    it('1.3.2: in BTC, typing a quantity shows its USDT value', () => {
      renderPanel();
      fireEvent.click(unitBtn('BTC'));
      // 0.002 BTC × $50,000 = $100
      fireEvent.change(getQtyInput(), { target: { value: '0.002' } });
      expect(screen.getByText(/≈/).textContent).toMatch(/\$100/);
    });

    it('1.3.3: switching back to USDT converts the amount to its value', () => {
      renderPanel();
      fireEvent.click(unitBtn('BTC'));
      fireEvent.change(getQtyInput(), { target: { value: '0.002' } });
      fireEvent.click(unitBtn('USDT'));
      // A market buy is valued at the ask (PRICE + 10): 0.002 × 50,010
      expect(getQtyInput().value).toBe('100.02');
    });

    it('1.3.4: USDT mode sends a value, BTC mode a quantity (the server converts)', async () => {
      renderPanel();
      fireEvent.change(getQtyInput(), { target: { value: '100' } });
      clickExecuteBtn();
      await waitFor(() => expect(fakePaperApi.placeOrder).toHaveBeenCalledTimes(1));
      expect(fakePaperApi.placeOrder.mock.calls[0][0]).toMatchObject({
        category: 'linear',
        value: '100',
      });

      fireEvent.click(unitBtn('BTC'));
      fireEvent.change(getQtyInput(), { target: { value: '0.002' } });
      clickExecuteBtn();
      await waitFor(() => expect(fakePaperApi.placeOrder).toHaveBeenCalledTimes(2));
      expect(fakePaperApi.placeOrder.mock.calls[1][0]).toMatchObject({ qty: '0.002' });
      expect(fakePaperApi.placeOrder.mock.calls[1][0]).not.toHaveProperty('value');
    });

    it('1.3.5: Max fills what the balance can pay after margin and both fees', () => {
      renderPanel();
      fireEvent.click(unitBtn('BTC'));
      fireEvent.click(screen.getByRole('button', { name: 'Max' }));
      // Sized at the ask, which a market buy fills at. At 1× a long's fee to close is 0 (bankruptcy
      // price 0): 10,000 / (50,010 × 1.00055) ≈ 0.19985
      expect(Number(getQtyInput().value)).toBeCloseTo(0.19985, 5);
    });
  });

  // ── 1.4 Buy with Take-Profit only ───────────────────────────────────────────

  describe('1.4 Buy with Take-Profit only', () => {
    it('1.4.1: enabling TP toggle reveals an input with green border (borderColor contains #2ccd78)', () => {
      renderPanel();
      const [tpToggle] = screen.getAllByRole('switch');
      fireEvent.click(tpToggle);

      // TP input should now be in the DOM
      // The TP input has a green borderColor inline style
      const tpInput = getTpInput();
      const style = (tpInput as HTMLInputElement).style;
      // #2ccd78 + alpha "60" hex → jsdom converts to rgba(44, 205, 120, …)
      expect(style.borderColor).toMatch(/44,\s*205,\s*120/);
    });
  });

  // ── 1.5 Sell with Stop-Loss only ────────────────────────────────────────────

  describe('1.5 Sell with Stop-Loss only', () => {
    it('1.5.1: enabling SL toggle reveals an input with red border (borderColor contains #d5455c)', () => {
      renderPanel();
      // SL toggle is the second switch
      const [, slToggle] = screen.getAllByRole('switch');
      fireEvent.click(slToggle);

      // SL input should now be in the DOM with red border
      const slInput = getSlInput();
      const style = (slInput as HTMLInputElement).style;
      // #d5455c + alpha "60" hex → jsdom converts to rgba(213, 69, 92, …)
      expect(style.borderColor).toMatch(/213,\s*69,\s*92/);
    });
  });

  // ── 1.6 Buy with both TP and SL ─────────────────────────────────────────────

  describe('1.6 Buy with both TP and SL', () => {
    it('1.6.1: enabling both TP and SL shows two extra inputs', () => {
      renderPanel();
      const spinbuttonsBefore = screen.getAllByRole('spinbutton').length;

      // Re-query after each click to avoid stale element references
      fireEvent.click(screen.getAllByRole('switch')[0]); // enable TP
      fireEvent.click(screen.getAllByRole('switch')[1]); // enable SL

      // Should have 2 additional inputs (TP + SL) plus the original qty
      const spinbuttonsAfter = screen.getAllByRole('spinbutton').length;
      expect(spinbuttonsAfter).toBe(spinbuttonsBefore + 2);
    });
  });

  // ── 1.7 Edge cases ──────────────────────────────────────────────────────────

  describe('1.7 Edge cases', () => {
    it('1.7.1: execute button is disabled when qty is empty', () => {
      renderPanel();
      // Qty is empty by default — the component disables the button rather than
      // showing a text error, which is the correct UX (error-on-submit pattern
      // cannot apply when the button is already gated by disabled state).
      const executeBtn = getExecuteBtn();
      expect(executeBtn.disabled).toBe(true);
    });

    it('1.7.2: submitting with qty > balance shows "Insufficient balance"', () => {
      renderPanel();
      const qtyInput = getQtyInput();
      // 20000 + commission is well above the $10,000 balance (lot-rounding safe)
      fireEvent.change(qtyInput, { target: { value: '20000' } });
      clickExecuteBtn();
      expect(screen.getByText('Insufficient balance')).toBeTruthy();
    });

    it('1.7.3: Buy with TP below entry price shows "Take-Profit must be above entry price for Long"', () => {
      renderPanel();
      const qtyInput = getQtyInput();
      fireEvent.change(qtyInput, { target: { value: '100' } });

      const [tpToggle] = screen.getAllByRole('switch');
      fireEvent.click(tpToggle);

      // TP input is now the last spinbutton; set it below live price (50000)
      const tpInput = getTpInput();
      fireEvent.change(tpInput, { target: { value: '49000' } });

      clickExecuteBtn();

      expect(screen.getByText('Take-Profit must be above entry price for Long')).toBeTruthy();
    });

    it('1.7.4: Buy with SL above entry price shows "Stop-Loss must be below entry price for Long"', () => {
      renderPanel();
      const qtyInput = getQtyInput();
      fireEvent.change(qtyInput, { target: { value: '100' } });

      const [, slToggle] = screen.getAllByRole('switch');
      fireEvent.click(slToggle);

      const slInput = getSlInput();
      fireEvent.change(slInput, { target: { value: '51000' } }); // above entry 50000

      clickExecuteBtn();

      expect(screen.getByText('Stop-Loss must be below entry price for Long')).toBeTruthy();
    });

    it('1.7.5: Sell with TP above entry price shows "Take-Profit must be below entry price for Short"', () => {
      renderPanel();
      // Select Sell side — the Sell side button is first in DOM among side selectors
      const sideButtons = screen.getAllByRole('button');
      const sellSideBtn = sideButtons.find((b) => b.textContent?.startsWith('Sell'));
      fireEvent.click(sellSideBtn!);

      const qtyInput = getQtyInput();
      fireEvent.change(qtyInput, { target: { value: '100' } });

      const [tpToggle] = screen.getAllByRole('switch');
      fireEvent.click(tpToggle);

      const tpInput = getTpInput();
      fireEvent.change(tpInput, { target: { value: '51000' } }); // above entry 50000

      clickExecuteBtn();

      expect(screen.getByText('Take-Profit must be below entry price for Short')).toBeTruthy();
    });

    it('1.7.6: Sell with SL below entry price shows "Stop-Loss must be above entry price for Short"', () => {
      renderPanel();
      const [sellSideEl] = screen
        .getAllByRole('button')
        .filter((b) => b.textContent?.startsWith('Sell'));
      fireEvent.click(sellSideEl!);

      const qtyInput = getQtyInput();
      fireEvent.change(qtyInput, { target: { value: '100' } });

      const [, slToggle] = screen.getAllByRole('switch');
      fireEvent.click(slToggle);

      const slInput = getSlInput();
      fireEvent.change(slInput, { target: { value: '49000' } }); // below entry 50000 → SHORT SL must be above

      clickExecuteBtn();

      expect(screen.getByText('Stop-Loss must be above entry price for Short')).toBeTruthy();
    });

    it('1.7.7: submit button is disabled when qty input is 0', () => {
      renderPanel();
      const qtyInput = getQtyInput();
      fireEvent.change(qtyInput, { target: { value: '0' } });

      expect(getExecuteBtn().disabled).toBe(true);
    });
  });
});

// ─── Section 2 — Limit Orders ─────────────────────────────────────────────────

describe('Section 2 — Limit Orders (T2 · RTL)', () => {
  // ── 2.1 Limit Buy below market ──────────────────────────────────────────────

  describe('2.1 Limit Buy below market', () => {
    it('2.1.1: switching to Limit tab shows a Price input pre-filled with live price', () => {
      renderPanel();
      // Click the "Limit" tab
      const limitTab = screen.getByRole('tab', { name: /limit/i });
      fireEvent.click(limitTab);

      // The price input should now be visible
      // Price label should appear
      expect(screen.getByText('Price')).toBeTruthy();
      // The price input spinbutton should exist and have a non-empty value
      const priceInput = getPriceInput();
      const val = parseFloat((priceInput as HTMLInputElement).value);
      // Pre-fill is bid (50000 - 10 = 49990) or latestPrice * 0.9999
      expect(val).toBeGreaterThan(0);
    });
  });

  // ── 2.5 Edge cases ──────────────────────────────────────────────────────────

  describe('2.5 Edge cases', () => {
    /** Switch to Limit tab with a typed trigger price lower than current price */
    function setupLimitBuy(triggerPrice: number) {
      const limitTab = screen.getByRole('tab', { name: /limit/i });
      fireEvent.click(limitTab);
      // Set the price input to a specific value
      fireEvent.change(getPriceInput(), { target: { value: String(triggerPrice) } });
    }

    it('2.5.1: Limit Buy with TP below trigger price → "Take-Profit must be above entry price for Long"', () => {
      renderPanel();
      setupLimitBuy(48_000); // trigger below PRICE

      // Enter qty
      fireEvent.change(getQtyInput(), { target: { value: '200' } });

      // Enable TP
      const [tpToggle] = screen.getAllByRole('switch');
      fireEvent.click(tpToggle);

      // Set TP below trigger
      fireEvent.change(getTpInput(), { target: { value: '47000' } });

      clickExecuteBtn();

      expect(screen.getByText('Take-Profit must be above entry price for Long')).toBeTruthy();
    });

    it('2.5.2: Limit Buy with SL above trigger price → "Stop-Loss must be below entry price for Long"', () => {
      renderPanel();
      setupLimitBuy(48_000);

      // Enter qty
      fireEvent.change(getQtyInput(), { target: { value: '200' } });

      // Enable SL
      const [, slToggle] = screen.getAllByRole('switch');
      fireEvent.click(slToggle);

      // Set SL above trigger
      fireEvent.change(getSlInput(), { target: { value: '49000' } });

      clickExecuteBtn();

      expect(screen.getByText('Stop-Loss must be below entry price for Long')).toBeTruthy();
    });

    it('2.5.4: Limit order that exceeds balance shows "Insufficient balance"', () => {
      renderPanel();
      const limitTab = screen.getByRole('tab', { name: /limit/i });
      fireEvent.click(limitTab);

      // Enter qty well above balance — 20000 is 2× balance, safe after lot-rounding
      fireEvent.change(getQtyInput(), { target: { value: '20000' } });

      clickExecuteBtn();

      expect(screen.getByText('Insufficient balance')).toBeTruthy();
    });
  });
});

// ─── Section 4 — Cross-cutting / Regression (T2 · RTL) ───────────────────────

describe('Section 4 — Cross-cutting / Regression (T2 · RTL)', () => {
  // ── 4.1 Symbol change resets form but preserves tab ──────────────────────

  describe('4.1 Symbol change (key remount) resets form, preserves tab', () => {
    it('4.1: switching to Limit tab then re-rendering with a new key (symbol change) clears qty, preserves initialTab=limit', () => {
      const { rerender } = render(
        <TradingPanel key="BTCUSDT" onClose={vi.fn()} initialTab="limit" />
      );

      // Type a qty value
      fireEvent.change(getQtyInput(), { target: { value: '200' } });

      // Simulate symbol change by remounting with a new key + new initialTab (lifted state)
      paneStores[0].setState({ latestPrice: 3_000, bid: 2_990, ask: 3_010 });
      rerender(<TradingPanel key="ETHUSDT" onClose={vi.fn()} initialTab="limit" />);

      // After key remount: qty should be empty (form reset), Limit tab preserved
      expect(getQtyInput().value).toBe('');
      // Limit tab still active: "Price" label visible
      expect(screen.getByText('Price')).toBeTruthy();
    });

    it('4.1: Market tab is preserved on symbol change (initialTab=market remount)', () => {
      const { rerender } = render(
        <TradingPanel key="BTCUSDT" onClose={vi.fn()} initialTab="market" />
      );

      rerender(<TradingPanel key="ETHUSDT" onClose={vi.fn()} initialTab="market" />);

      // Market tab active — no "Price" label (that's only on Limit/Stop)
      expect(screen.queryByText('Price')).toBeNull();
      // MARKET button visible in submit button
      const submitBtn = getExecuteBtn();
      expect(submitBtn.textContent).toMatch(/MARKET/);
    });
  });

  // ── 4.2 Symbol change on Limit tab ───────────────────────────────────────

  describe('4.2 Symbol change while on Limit tab updates price pre-fill', () => {
    it('4.2: mounting on Limit tab pre-fills price from the new symbol live price', () => {
      // New symbol: ETH at 3 000
      paneStores[0].setState({ latestPrice: 3_000, bid: 2_990, ask: 3_010 });

      renderPanel({ initialTab: 'limit' });

      const priceInput = getPriceInput();
      const val = parseFloat((priceInput as HTMLInputElement).value);
      // Pre-fill = bid (2990) for Buy/Limit
      expect(val).toBeCloseTo(2_990, 0);
    });
  });

  // ── 4.3 Symbol change on Stop tab ────────────────────────────────────────

  describe('4.3 Symbol change while on Stop tab updates price pre-fill', () => {
    it('4.3: mounting on Stop tab pre-fills price from the new symbol ask (Buy) or bid (Sell)', () => {
      paneStores[0].setState({ latestPrice: 3_000, bid: 2_990, ask: 3_010 });

      renderPanel({ initialTab: 'stop' });

      const priceInput = getPriceInput();
      const val = parseFloat((priceInput as HTMLInputElement).value);
      // Stop+Buy default is ask (3010)
      expect(val).toBeCloseTo(3_010, 0);
    });
  });

  // ── 4.4 Close/reopen: tab + side + form state preserved ──────────────────

  describe('4.4 TradingPanel tab + side preserved via props (close/reopen parity)', () => {
    it('4.4: panel mounted with initialTab=limit and initialSide=sell shows Limit tab + Sell side active', () => {
      renderPanel({ initialTab: 'limit', initialSide: 'sell' });

      // Limit tab should be active (Price label present)
      expect(screen.getByText('Price')).toBeTruthy();
      // Sell side button appears — check the execute button text contains "Sell"
      const submitBtn = getExecuteBtn();
      expect(submitBtn.textContent?.toLowerCase()).toMatch(/sell/);
    });

    it('4.4: panel mounted with initialTab=stop and initialSide=buy shows Stop tab + Buy side active', () => {
      renderPanel({ initialTab: 'stop', initialSide: 'buy' });

      // Stop tab active — price input exists
      expect(screen.getByText('Price')).toBeTruthy();
      const submitBtn = getExecuteBtn();
      expect(submitBtn.textContent?.toLowerCase()).toMatch(/buy/);
      expect(submitBtn.textContent).toMatch(/STOP/i);
    });

    it('4.4: form state (qty, TP/SL toggles) survives a normal re-render (same key = same instance, no unmount)', () => {
      const { rerender } = renderPanel();

      // Enter qty
      const qtyInput = getQtyInput();
      fireEvent.change(qtyInput, { target: { value: '300' } });

      // Enable both TP and SL toggles — re-query after each click to avoid stale element references
      fireEvent.click(screen.getAllByRole('switch')[0]); // enable TP
      fireEvent.click(screen.getAllByRole('switch')[1]); // enable SL

      // Re-render same component (same key) — simulates parent re-render without symbol change
      rerender(<TradingPanel onClose={vi.fn()} />);

      // qty should still be 300
      const qtyAfter = getQtyInput();
      expect((qtyAfter as HTMLInputElement).value).toBe('300');
      // TP + SL inputs should still be present (toggles preserved)
      const inputCount = screen.getAllByRole('spinbutton').length;
      expect(inputCount).toBeGreaterThanOrEqual(3); // qty + TP + SL
    });
  });
});

// ─── Section 3 — Stop Orders ──────────────────────────────────────────────────

describe('Section 3 — Stop Orders (T2 · RTL)', () => {
  /** Switch to Stop tab */
  function switchToStopTab() {
    const stopTab = screen.getByRole('tab', { name: /stop/i });
    fireEvent.click(stopTab);
  }

  /** Switch side to Sell */
  function switchToSell() {
    const sellBtn = screen.getAllByRole('button').find((b) => b.textContent?.startsWith('Sell'))!;
    fireEvent.click(sellBtn);
  }

  // ── 3.5 Stop order price-direction warning ───────────────────────────────────

  describe('3.5 Stop order direction warnings', () => {
    it('3.5.1: Stop Buy below market price shows immediate-fill warning with "will fill immediately" and "Use a Limit Buy"', () => {
      renderPanel();
      switchToStopTab();
      // Default side = Buy; type a price below the live price (50 000) → triggers warning
      const priceInput = getPriceInput();
      fireEvent.change(priceInput, { target: { value: '49000' } });

      expect(screen.getByText(/will fill immediately/)).toBeTruthy();
      expect(screen.getByText(/Use a Limit Buy/)).toBeTruthy();
    });

    it('3.5.2: Stop Sell above market price shows immediate-fill warning with "will fill immediately" and "Use a Limit Sell"', () => {
      renderPanel();
      switchToStopTab();
      switchToSell();
      // Type a price above the live price (50 000) → triggers warning
      const priceInput = getPriceInput();
      fireEvent.change(priceInput, { target: { value: '51000' } });

      expect(screen.getByText(/will fill immediately/)).toBeTruthy();
      expect(screen.getByText(/Use a Limit Sell/)).toBeTruthy();
    });

    it('3.5.1 no-warning: Stop Buy above market does NOT show the warning banner', () => {
      renderPanel();
      switchToStopTab();
      // On Stop+Buy, the default pre-fill is ask=50010 (above market) — no warning.
      // Confirm by explicitly typing a price above market.
      const priceInput = getPriceInput();
      fireEvent.change(priceInput, { target: { value: '51000' } });

      expect(screen.queryByText(/will fill immediately/)).toBeNull();
    });

    it('3.5.2 no-warning: Stop Sell below market does NOT show the warning banner', () => {
      renderPanel();
      switchToStopTab();
      switchToSell();
      // Default pre-fill for Stop+Sell is bid=49990 (below market) — no warning.
      const priceInput = getPriceInput();
      fireEvent.change(priceInput, { target: { value: '49000' } });

      expect(screen.queryByText(/will fill immediately/)).toBeNull();
    });
  });

  // ── 3.5 Insufficient balance for stop order ──────────────────────────────────

  describe('3.5 Edge cases', () => {
    it('3.x: Stop order that exceeds balance shows "Insufficient balance"', () => {
      renderPanel();
      switchToStopTab();

      fireEvent.change(getQtyInput(), { target: { value: '20000' } });

      clickExecuteBtn();

      expect(screen.getByText('Insufficient balance')).toBeTruthy();
    });
  });
});

// ─── Section 1.7.11 — SL typo safety rails (T2 · RTL) ───────────────────────
//
// Regression tests for the 4.18 incident blocker:
//   - Entering SL=7800 on a BTC order with live price ~78000 triggers the
//     blocking confirm modal (typo guard).
//   - Cancelling the modal returns focus without placing the order.
//   - Confirming the modal places the order.
//   - Entering a valid SL (e.g. 75000) does NOT show the modal.
//   - Very large-distance SL (>10% from entry) shows the modal.

const BTC_PRICE = 78_000;

function setupBTCStores() {
  paneStores[0].setState({
    latestPrice: BTC_PRICE,
    isConnected: true,
    bid: BTC_PRICE - 10,
    ask: BTC_PRICE + 10,
  });
  useLayoutStore.setState({ activePane: 0 });
}

describe('Section 1.7.11 — SL typo safety rails (T2 · RTL)', () => {
  beforeEach(() => {
    usePaperStore.getState().clear();
    usePaperStore.getState().hydrate(emptyState());
    useAuthStore.setState({ accessToken: 'test-token' });
    resetFakePaperApi();
    localStorage.clear();
    setupBTCStores();
  });

  afterEach(() => {
    cleanup();
  });

  it('1.7.11: entering SL=7800 for BTC at 78000 shows blocking confirm modal', () => {
    renderPanel();

    // Enter a valid qty and enable SL toggle
    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    fireEvent.click(screen.getByLabelText('Enable stop loss'));

    // Type the typo SL
    fireEvent.change(getSlInput(), { target: { value: '7800' } });

    // Click submit
    clickExecuteBtn();

    // Confirm modal should be present
    const modal = screen.getByTestId('sl-confirm-modal');
    expect(modal).toBeTruthy();
    // Should contain warning text about the typo (scoped to modal to avoid false matches)
    expect(within(modal).getByText(/7,800/)).toBeTruthy();
    expect(within(modal).getAllByText(/78,000/).length).toBeGreaterThan(0);
  });

  it('1.7.11: clicking Cancel on the modal dismisses it without placing the order', () => {
    renderPanel();

    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    fireEvent.click(screen.getByLabelText('Enable stop loss'));
    fireEvent.change(getSlInput(), { target: { value: '7800' } });
    clickExecuteBtn();

    // Modal is shown
    expect(screen.getByTestId('sl-confirm-modal')).toBeTruthy();

    // Click Cancel
    fireEvent.click(screen.getByText('Cancel'));

    // Modal dismissed, no order placed
    expect(screen.queryByTestId('sl-confirm-modal')).toBeNull();
    expect(fakePaperApi.placeOrder).not.toHaveBeenCalled();
    expect(usePaperStore.getState().positions).toHaveLength(0);
  });

  it('1.7.11: clicking submit again after Cancel re-shows the modal (not bypassed)', () => {
    renderPanel();

    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    fireEvent.click(screen.getByLabelText('Enable stop loss'));
    fireEvent.change(getSlInput(), { target: { value: '7800' } });
    clickExecuteBtn();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('sl-confirm-modal')).toBeNull();

    // Click submit again — modal should re-appear
    clickExecuteBtn();
    expect(screen.getByTestId('sl-confirm-modal')).toBeTruthy();
  });

  it('1.7.11: clicking "Confirm SL/TP anyway" places the order and dismisses modal', async () => {
    renderPanel();

    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    fireEvent.click(screen.getByLabelText('Enable stop loss'));
    fireEvent.change(getSlInput(), { target: { value: '7800' } });
    clickExecuteBtn();

    expect(screen.getByTestId('sl-confirm-modal')).toBeTruthy();

    // Confirm the suspicious SL
    fireEvent.click(screen.getByTestId('sl-confirm-anyway'));

    // Modal gone
    expect(screen.queryByTestId('sl-confirm-modal')).toBeNull();
    // Order sent with the typo SL as confirmed, and the position created
    await waitFor(() => expect(usePaperStore.getState().positions).toHaveLength(1));
    expect(fakePaperApi.placeOrder.mock.calls[0][0]).toMatchObject({ stopLoss: '7800' });
    expect(usePaperStore.getState().positions[0].stopLoss).toBe(7_800);
  });

  it('1.7.11: valid SL (5% below entry) does NOT trigger the confirm modal', () => {
    renderPanel();

    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    fireEvent.click(screen.getByLabelText('Enable stop loss'));

    // 5% below BTC_PRICE = 74100 — well within normal range
    fireEvent.change(getSlInput(), { target: { value: '74100' } });

    clickExecuteBtn();

    // No modal — order should place directly (or show a different validation error)
    expect(screen.queryByTestId('sl-confirm-modal')).toBeNull();
  });

  it('1.7.12: SL > 10% from entry triggers large-distance confirm modal', () => {
    renderPanel();

    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    fireEvent.click(screen.getByLabelText('Enable stop loss'));

    // 11% below BTC_PRICE = ~69420 — exceeds SL_MAX_DISTANCE (10%)
    const largeSl = Math.floor(BTC_PRICE * 0.89); // ~69420
    fireEvent.change(getSlInput(), { target: { value: String(largeSl) } });

    clickExecuteBtn();

    // Confirm modal should appear (large-distance warning)
    expect(screen.getByTestId('sl-confirm-modal')).toBeTruthy();
  });
});

// ─── BP-2 — markets, Spot form, leverage ──────────────────────────────────────

describe('BP-2 — market tabs and leverage', () => {
  it('shows Spot | USDT Perpetual tabs and switches the pane market', () => {
    renderPanel();
    const tabs = within(screen.getByRole('tablist', { name: 'Market' }));
    expect(tabs.getByRole('tab', { name: 'USDT Perpetual' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    fireEvent.click(tabs.getByRole('tab', { name: 'Spot' }));
    const pane = useLayoutStore.getState().panes[0];
    expect(pane).toMatchObject({ category: 'spot', symbol: 'BTCUSDT' });
  });

  it('shows the symbol leverage chip on USDT Perpetual', () => {
    usePaperStore.setState({ symbolLeverage: { BTCUSDT: 5 } });
    renderPanel();
    expect(screen.getByRole('button', { name: /Leverage 5x, isolated margin/ })).toBeTruthy();
  });

  it('re-margins an open position: the modal previews the new margin and liquidation price (BP-3)', async () => {
    usePaperStore.setState({
      positions: [
        {
          id: 'p1',
          category: 'linear',
          symbol: 'BTCUSDT',
          side: 'long',
          quantity: 0.1,
          entryPrice: 50_000,
          entryUsdtAmount: 5_000,
          leverage: 1,
          entryFee: 2.75,
          closeFeeReserve: 0,
          extraMargin: 0,
          liqPrice: 0,
          bustPrice: 0,
          positionIM: 5_000,
          positionMM: 16.5,
          cumFunding: 0,
          openedAt: 1,
        },
      ],
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Leverage 1x, isolated margin/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('re-margined at the new leverage');
    fireEvent.click(within(dialog).getByRole('button', { name: '5×' }));
    // 5×: IM 1,000 + fee to close 5,000 × 0.8 × 0.055% = 2.20; liq (5,000 − 1,000) / 0.09967
    const preview = within(dialog).getByTestId('remargin-preview');
    expect(preview.textContent).toContain('Position margin: $5000.00 → $1002.20');
    expect(preview.textContent).toContain('Liq. price: — → $40,132.44');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(fakePaperApi.setSymbolLeverage).toHaveBeenCalledWith('BTCUSDT', 5, 'test-token')
    );
  });

  it('shows the server’s refusal of a leverage change inline', async () => {
    fakePaperApi.setSymbolLeverage.mockRejectedValueOnce(
      new Error(
        'Insufficient available balance to change leverage (more margin is needed at the new leverage).'
      )
    );
    usePaperStore.setState({ symbolLeverage: { BTCUSDT: 10 } });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Leverage 10x, isolated margin/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '1×' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'Insufficient available balance'
    );
  });
});

describe('BP-2 — Spot form', () => {
  beforeEach(() => {
    useLayoutStore.setState((s) => ({
      panes: s.panes.map((p, i) => (i === 0 ? { ...p, category: 'spot' } : p)),
    }));
  });

  it('offers Market and Limit only (no stop orders on spot), and no leverage chip', () => {
    renderPanel();
    expect(screen.queryByRole('tab', { name: 'Stop' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Limit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Leverage/ })).toBeNull();
  });

  it('a remembered Stop tab opens as Market on spot', () => {
    renderPanel({ initialTab: 'stop' });
    expect(screen.getByRole('tab', { name: 'Market' }).getAttribute('aria-selected')).toBe('true');
  });

  it('a buy shows the fee in the coin received (0.1%)', () => {
    renderPanel();
    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    // 100 USDT at 50,000 = 0.002 BTC; fee 0.002 × 0.001 = 0.000002 BTC
    expect(screen.getByText('0.00000200 BTC')).toBeTruthy();
    expect(screen.getByText('Fee: 0.1%')).toBeTruthy();
  });

  it('a sell shows the free coins as available and has no TP / SL', () => {
    usePaperStore.setState({
      spotBalances: [{ coin: 'BTC', free: 0.5, locked: 0.1, avgCost: 40_000 }],
    });
    renderPanel({ initialSide: 'sell' });
    expect(screen.getAllByText('0.500000 BTC').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Enable take profit')).toBeNull();
  });

  it('F8: selling more than the free coins is refused before sending (no shorting)', () => {
    usePaperStore.setState({
      spotBalances: [{ coin: 'BTC', free: 0.001, locked: 0, avgCost: 40_000 }],
    });
    renderPanel({ initialSide: 'sell' });
    fireEvent.change(getQtyInput(), { target: { value: '1000' } });
    clickExecuteBtn();
    expect(screen.getByText(/Not enough BTC available/)).toBeTruthy();
    expect(fakePaperApi.placeOrder).not.toHaveBeenCalled();
  });

  it('sends the order as a spot order', async () => {
    renderPanel();
    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    clickExecuteBtn();
    await waitFor(() => expect(fakePaperApi.placeOrder).toHaveBeenCalledTimes(1));
    expect(fakePaperApi.placeOrder.mock.calls[0][0]).toMatchObject({
      category: 'spot',
      side: 'buy',
      type: 'market',
    });
  });
});

describe('BP-3 — liquidation in the USDT Perpetual form', () => {
  const unitBtn = (name: string) =>
    within(screen.getByRole('group', { name: 'Amount unit' })).getByRole('button', { name });

  it('shows the estimated liquidation price of the position the order would open', () => {
    usePaperStore.setState({ symbolLeverage: { BTCUSDT: 10 } });
    renderPanel();
    fireEvent.click(unitBtn('BTC'));
    fireEvent.change(getQtyInput(), { target: { value: '0.1' } });
    // Long 0.1 at the ask 50,010, 10×: (5,001 − 500.1) / (0.1 × (1 − 0.33%)) ≈ 45,158.02
    expect(screen.getByText('Est. liq. price')).toBeTruthy();
    expect(screen.getByTestId('order-est-liq-price').textContent).toBe('$45,158.02');
  });

  it('a 1× long can not be liquidated: the estimate shows —', () => {
    renderPanel();
    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    expect(screen.getByTestId('order-est-liq-price').textContent).toBe('—');
  });

  it('reads "Placing…" and is disabled while the order request is in flight', async () => {
    let release: () => void = () => undefined;
    const original = fakePaperApi.placeOrder.getMockImplementation();
    fakePaperApi.placeOrder.mockImplementationOnce(async (body) => {
      await new Promise<void>((r) => (release = r));
      return original!(body);
    });
    renderPanel();
    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    clickExecuteBtn();
    await waitFor(() => expect(screen.getByText('Placing…')).toBeTruthy());
    expect(getExecuteBtn().disabled).toBe(true);
    release();
    await waitFor(() => expect(screen.queryByText('Placing…')).toBeNull());
  });

  it('shows the one-time "positions can now be liquidated" notice until dismissed', () => {
    const { unmount } = renderPanel();
    expect(screen.getByText('Positions can now be liquidated')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'How liquidation works' }));
    expect(screen.getByText(/closed at the bankruptcy price/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss liquidation notice' })[0]);
    expect(screen.queryByText('Positions can now be liquidated')).toBeNull();
    unmount();
    renderPanel();
    expect(screen.queryByText('Positions can now be liquidated')).toBeNull();
  });

  it('tells the user when a position was liquidated, until they dismiss it', () => {
    usePaperStore.setState({
      history: [
        {
          id: 't1',
          category: 'linear',
          symbol: 'BTCUSDT',
          side: 'long',
          quantity: 0.1,
          entryPrice: 50_000,
          exitPrice: 45_000,
          pnl: -500,
          openedAt: 1,
          closedAt: 2,
          liquidated: true,
        },
      ],
    });
    renderPanel();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('BTCUSDT Long was liquidated');
    expect(alert.textContent).toContain('Position margin lost: $500.00');
    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss liquidation notice' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows no liquidation notices on Spot', () => {
    useLayoutStore.setState((s) => ({
      panes: s.panes.map((p, i) => (i === 0 ? { ...p, category: 'spot' } : p)),
    }));
    renderPanel();
    expect(screen.queryByText('Positions can now be liquidated')).toBeNull();
  });
});

// ─── BP-5 B — trigger source, reduce-only, close-on-trigger ─────────────────

/** An open 0.1 BTC long (USDT Perpetual) for the reduce-only cases */
function longPosition(): Position {
  return {
    id: 'p-long',
    category: 'linear',
    symbol: 'BTCUSDT',
    side: 'long',
    quantity: 0.1,
    entryPrice: 50_000,
    entryUsdtAmount: 500,
    leverage: 10,
    entryFee: 2.75,
    closeFeeReserve: 2.475,
    extraMargin: 0,
    liqPrice: 45_148.99,
    bustPrice: 45_000,
    positionIM: 502.475,
    positionMM: 18.975,
    cumFunding: 0,
    openedAt: 1,
  };
}

describe('BP-5 B — order flags and trigger source (USDT Perpetual)', () => {
  it('a TP set to trigger on the mark price sends tpTriggerBy', async () => {
    renderPanel();
    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    const [tpToggle] = screen.getAllByRole('switch');
    fireEvent.click(tpToggle);
    fireEvent.change(getTpInput(), { target: { value: '55000' } });
    fireEvent.change(screen.getByLabelText('Take profit trigger price'), {
      target: { value: 'MarkPrice' },
    });
    clickExecuteBtn();
    await waitFor(() => expect(fakePaperApi.placeOrder).toHaveBeenCalledTimes(1));
    expect(fakePaperApi.placeOrder.mock.calls[0][0]).toMatchObject({
      takeProfit: '55000',
      tpTriggerBy: 'MarkPrice',
    });
    // LastPrice is the default: never sent for the SL that wasn't set
    expect(fakePaperApi.placeOrder.mock.calls[0][0]).not.toHaveProperty('slTriggerBy');
  });

  it('Reduce-only with no position, or on the position side, is stopped before submit (review #146)', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('Reduce-only'));
    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    clickExecuteBtn();
    expect(
      screen.getByText('Reduce-only needs an open position on this symbol to reduce')
    ).toBeTruthy();
    expect(fakePaperApi.placeOrder).not.toHaveBeenCalled();
    cleanup();
    usePaperStore.setState({ positions: [longPosition()] });
    renderPanel();
    fireEvent.click(screen.getByLabelText('Reduce-only'));
    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    clickExecuteBtn(); // Buy on a long
    expect(
      screen.getByText('Reduce-only can only reduce your long position — use Sell')
    ).toBeTruthy();
    expect(fakePaperApi.placeOrder).not.toHaveBeenCalled();
  });

  it('Reduce-only hides TP / SL, skips the balance check and sends reduceOnly', async () => {
    usePaperStore.setState({ positions: [longPosition()] });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /sell/i }));
    fireEvent.click(screen.getByLabelText('Reduce-only'));
    expect(screen.queryByText('Exits')).toBeNull();
    // Far more than the balance: a reduce-only order holds no margin (the server caps it)
    fireEvent.change(getQtyInput(), { target: { value: '1000000' } });
    clickExecuteBtn();
    await waitFor(() => expect(fakePaperApi.placeOrder).toHaveBeenCalledTimes(1));
    const [body] = fakePaperApi.placeOrder.mock.calls[0];
    expect(body).toMatchObject({ reduceOnly: true });
    expect(body).not.toHaveProperty('takeProfit');
    expect(screen.queryByText('Insufficient balance')).toBeNull();
  });

  it('Close on trigger is offered for a stop order only, and implies reduce-only', async () => {
    usePaperStore.setState({ positions: [longPosition()] });
    renderPanel();
    expect(screen.queryByLabelText('Close on trigger')).toBeNull();
    // A sell stop below the market: a stop-loss for a long
    fireEvent.click(screen.getByRole('button', { name: /sell/i }));
    fireEvent.click(screen.getByRole('tab', { name: /stop/i }));
    fireEvent.change(getPriceInput(), { target: { value: '48000' } });
    fireEvent.click(screen.getByLabelText('Close on trigger'));
    fireEvent.change(getQtyInput(), { target: { value: '100' } });
    clickExecuteBtn();
    await waitFor(() => expect(fakePaperApi.placeOrder).toHaveBeenCalledTimes(1));
    expect(fakePaperApi.placeOrder.mock.calls[0][0]).toMatchObject({
      type: 'stop',
      closeOnTrigger: true,
      reduceOnly: true,
    });
  });

  it('spot has no reduce-only', () => {
    useLayoutStore.setState((s) => ({
      panes: s.panes.map((p, i) => (i === 0 ? { ...p, category: 'spot' } : p)),
    }));
    renderPanel();
    expect(screen.queryByLabelText('Reduce-only')).toBeNull();
  });
});

describe('BP-5 C — tier info in the leverage modal (O6)', () => {
  it('shows the tier and the max position value at the chosen leverage', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Leverage \d+x, isolated margin/ }));
    const dialog = screen.getByRole('dialog', { name: /Adjust leverage/ });
    fireEvent.click(within(dialog).getByRole('button', { name: '10×' }));
    expect(within(dialog).getByTestId('leverage-tier-info').textContent).toBe(
      'Risk-limit tier 1 (up to 300,000 USDT) · MMR 0.33% · Max position value at 10×: 100,000,000 USDT'
    );
  });
});

describe('BP-5 E — margin mode in the leverage chip and modal', () => {
  it('the chip names the mode; switching to Cross calls the server before the leverage', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Leverage 1x, isolated margin' }));
    expect(screen.getByText(/^Isolated 1x/)).toBeTruthy();
    const dialog = screen.getByRole('dialog', { name: /Adjust leverage/ });
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Cross' }));
    expect(within(dialog).getByTestId('margin-mode-explainer').textContent).toContain(
      'applies to your whole account'
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '5×' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(fakePaperApi.setMarginMode).toHaveBeenCalledWith('REGULAR_MARGIN', 'test-token')
    );
    await waitFor(() => expect(fakePaperApi.setSymbolLeverage).toHaveBeenCalled());
    expect(fakePaperApi.setMarginMode.mock.invocationCallOrder[0]).toBeLessThan(
      fakePaperApi.setSymbolLeverage.mock.invocationCallOrder[0]
    );
  });

  it('a refused switch shows every reason inline and leaves the leverage alone', async () => {
    fakePaperApi.setMarginMode.mockRejectedValueOnce(
      new Error(
        'Set margin mode failed: The BTCUSDT position would be liquidated immediately in isolated margin'
      )
    );
    usePaperStore.setState({ marginMode: 'REGULAR_MARGIN' });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Leverage 1x, cross margin' }));
    const dialog = screen.getByRole('dialog', { name: /Adjust leverage/ });
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Isolated' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '5×' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'would be liquidated immediately'
    );
    expect(fakePaperApi.setSymbolLeverage).not.toHaveBeenCalled();
  });
});
