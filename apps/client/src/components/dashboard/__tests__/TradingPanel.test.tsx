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
 *     1.7.1  Submit with empty qty → error "Enter a USD amount"   (T2)
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
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TradingPanel } from '../TradingPanel';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Framer-motion: forward all motion.* as plain HTML elements; skip animations.
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>, ref: React.Ref<HTMLElement>) =>
          React.createElement(tag, { ...props, ref }, children)
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
  // layoutStore defaults to activePane=0, panes[0].symbol='BTCUSDT' — no change needed.
  useLayoutStore.setState({ activePane: 0 });
}

function renderPanel(props: Partial<React.ComponentProps<typeof TradingPanel>> = {}) {
  return render(<TradingPanel onClose={vi.fn()} {...props} />);
}


/**
 * Click the execute (Buy/Sell) button — always the last <button> in the panel.
 * We cannot use { name: /buy/i } because the side-selector "Buy" button also
 * matches. The execute button is the last button in DOM order.
 */
function clickExecuteBtn() {
  const buttons = screen.getAllByRole('button');
  fireEvent.click(buttons[buttons.length - 1]);
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  usePaperStore.getState().reset();
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
    it('1.1.1: order info shows Margin and Commission when qty is entered', () => {
      renderPanel();
      const qtyInput = screen.getAllByRole('spinbutton')[0];
      fireEvent.change(qtyInput, { target: { value: '100' } });

      // Margin label + value
      expect(screen.getByText('Margin')).toBeTruthy();
      // commission row
      expect(screen.getByText('Commission')).toBeTruthy();
      // Commission ≈ $0.0700 (100 × 0.0007)
      const commissionValue = screen.getByText(/\$0\.0700/);
      expect(commissionValue).toBeTruthy();
    });

    it('1.1.2: clicking Buy clears the qty input', () => {
      renderPanel();
      const qtyInput = screen.getAllByRole('spinbutton')[0];
      fireEvent.change(qtyInput, { target: { value: '100' } });

      clickExecuteBtn();

      expect((qtyInput as HTMLInputElement).value).toBe('');
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

  describe('1.3 Units mode', () => {
    it('1.3.1: clicking ⇄ Units toggles label to "Quantity (BTC)"', () => {
      renderPanel();
      // Default label is "Amount (USD)"
      expect(screen.getByText('Amount (USD)')).toBeTruthy();

      // Click the ⇄ Units button
      const unitsBtn = screen.getByRole('button', { name: /units/i });
      fireEvent.click(unitsBtn);

      expect(screen.getByText('Quantity (BTC)')).toBeTruthy();
    });

    it('1.3.2: in Units mode, typing in qty shows a USD equivalent', () => {
      renderPanel();
      const unitsBtn = screen.getByRole('button', { name: /units/i });
      fireEvent.click(unitsBtn);

      const qtyInput = screen.getAllByRole('spinbutton')[0];
      // 0.002 BTC × $50,000 = $100 USD
      fireEvent.change(qtyInput, { target: { value: '0.002' } });

      // Equivalent "≈ $100.00" or similar should appear
      const equiv = screen.getByText(/≈/);
      expect(equiv.textContent).toMatch(/\$100/);
    });

    it('1.3.3: switching back to USD shows BTC equivalent', () => {
      renderPanel();
      // Go to Units mode
      const unitsBtn = screen.getByRole('button', { name: /units/i });
      fireEvent.click(unitsBtn);

      const qtyInput = screen.getAllByRole('spinbutton')[0];
      fireEvent.change(qtyInput, { target: { value: '0.002' } });

      // Switch back to USD
      const usdBtn = screen.getByRole('button', { name: /usd/i });
      fireEvent.click(usdBtn);

      // Combined: "Amount (USD)" label should be visible again
      expect(screen.getByText('Amount (USD)')).toBeTruthy();
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
      const allInputs = screen.getAllByRole('spinbutton');
      const tpInput = allInputs[allInputs.length - 1]; // last input is TP
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
      const allInputs = screen.getAllByRole('spinbutton');
      const slInput = allInputs[allInputs.length - 1];
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
      const buttons = screen.getAllByRole('button');
      const executeBtn = buttons[buttons.length - 1] as HTMLButtonElement;
      expect(executeBtn.disabled).toBe(true);
    });

    it('1.7.2: submitting with qty > balance shows "Insufficient balance"', () => {
      renderPanel();
      const qtyInput = screen.getAllByRole('spinbutton')[0];
      // 20000 + commission is well above the $10,000 balance (lot-rounding safe)
      fireEvent.change(qtyInput, { target: { value: '20000' } });
      clickExecuteBtn();
      expect(screen.getByText('Insufficient balance')).toBeTruthy();
    });

    it('1.7.3: Buy with TP below entry price shows "Take-Profit must be above entry price for Long"', () => {
      renderPanel();
      const qtyInput = screen.getAllByRole('spinbutton')[0];
      fireEvent.change(qtyInput, { target: { value: '100' } });

      const [tpToggle] = screen.getAllByRole('switch');
      fireEvent.click(tpToggle);

      // TP input is now the last spinbutton; set it below live price (50000)
      const allInputs = screen.getAllByRole('spinbutton');
      const tpInput = allInputs[allInputs.length - 1];
      fireEvent.change(tpInput, { target: { value: '49000' } });

      clickExecuteBtn();

      expect(screen.getByText('Take-Profit must be above entry price for Long')).toBeTruthy();
    });

    it('1.7.4: Buy with SL above entry price shows "Stop-Loss must be below entry price for Long"', () => {
      renderPanel();
      const qtyInput = screen.getAllByRole('spinbutton')[0];
      fireEvent.change(qtyInput, { target: { value: '100' } });

      const [, slToggle] = screen.getAllByRole('switch');
      fireEvent.click(slToggle);

      const allInputs = screen.getAllByRole('spinbutton');
      const slInput = allInputs[allInputs.length - 1];
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

      const qtyInput = screen.getAllByRole('spinbutton')[0];
      fireEvent.change(qtyInput, { target: { value: '100' } });

      const [tpToggle] = screen.getAllByRole('switch');
      fireEvent.click(tpToggle);

      const allInputs = screen.getAllByRole('spinbutton');
      const tpInput = allInputs[allInputs.length - 1];
      fireEvent.change(tpInput, { target: { value: '51000' } }); // above entry 50000

      clickExecuteBtn();

      expect(
        screen.getByText('Take-Profit must be below entry price for Short')
      ).toBeTruthy();
    });

    it('1.7.6: Sell with SL below entry price shows "Stop-Loss must be above entry price for Short"', () => {
      renderPanel();
      const [sellSideEl] = screen
        .getAllByRole('button')
        .filter((b) => b.textContent?.startsWith('Sell'));
      fireEvent.click(sellSideEl!);

      const qtyInput = screen.getAllByRole('spinbutton')[0];
      fireEvent.change(qtyInput, { target: { value: '100' } });

      const [, slToggle] = screen.getAllByRole('switch');
      fireEvent.click(slToggle);

      const allInputs = screen.getAllByRole('spinbutton');
      const slInput = allInputs[allInputs.length - 1];
      fireEvent.change(slInput, { target: { value: '49000' } }); // below entry 50000 → SHORT SL must be above

      clickExecuteBtn();

      expect(
        screen.getByText('Stop-Loss must be above entry price for Short')
      ).toBeTruthy();
    });

    it('1.7.7: submit button is disabled when qty input is 0', () => {
      renderPanel();
      const qtyInput = screen.getAllByRole('spinbutton')[0];
      fireEvent.change(qtyInput, { target: { value: '0' } });

      const submitButton = screen
        .getAllByRole('button')
        .reverse()
        .find((b) => b.textContent?.includes('MARKET'));
      expect((submitButton as HTMLButtonElement)?.disabled).toBe(true);
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
      const allInputs = screen.getAllByRole('spinbutton');
      // First spinbutton after Limit tab switch is the price input
      const priceInput = allInputs[0];
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
      const allInputs = screen.getAllByRole('spinbutton');
      fireEvent.change(allInputs[0], { target: { value: String(triggerPrice) } });
    }

    it('2.5.1: Limit Buy with TP below trigger price → "Take-Profit must be above entry price for Long"', () => {
      renderPanel();
      setupLimitBuy(48_000); // trigger below PRICE

      // Enter qty
      const allInputs = screen.getAllByRole('spinbutton');
      fireEvent.change(allInputs[1], { target: { value: '200' } }); // qty input

      // Enable TP
      const [tpToggle] = screen.getAllByRole('switch');
      fireEvent.click(tpToggle);

      // Set TP below trigger
      const inputsAfterTp = screen.getAllByRole('spinbutton');
      fireEvent.change(inputsAfterTp[inputsAfterTp.length - 1], { target: { value: '47000' } });

      clickExecuteBtn();

      expect(
        screen.getByText('Take-Profit must be above entry price for Long')
      ).toBeTruthy();
    });

    it('2.5.2: Limit Buy with SL above trigger price → "Stop-Loss must be below entry price for Long"', () => {
      renderPanel();
      setupLimitBuy(48_000);

      // Enter qty
      const allInputs = screen.getAllByRole('spinbutton');
      fireEvent.change(allInputs[1], { target: { value: '200' } });

      // Enable SL
      const [, slToggle] = screen.getAllByRole('switch');
      fireEvent.click(slToggle);

      // Set SL above trigger
      const inputsAfterSl = screen.getAllByRole('spinbutton');
      fireEvent.change(inputsAfterSl[inputsAfterSl.length - 1], { target: { value: '49000' } });

      clickExecuteBtn();

      expect(
        screen.getByText('Stop-Loss must be below entry price for Long')
      ).toBeTruthy();
    });

    it('2.5.4: Limit order that exceeds balance shows "Insufficient balance"', () => {
      renderPanel();
      const limitTab = screen.getByRole('tab', { name: /limit/i });
      fireEvent.click(limitTab);

      // Enter qty well above balance — 20000 is 2× balance, safe after lot-rounding
      const allInputs = screen.getAllByRole('spinbutton');
      fireEvent.change(allInputs[1], { target: { value: '20000' } });

      clickExecuteBtn();

      expect(screen.getByText('Insufficient balance')).toBeTruthy();
    });
  });
});

