/**
 * paperStore tests
 *
 * Tests cover the core paper-trading business logic:
 *   - placeOrder(): validation, balance deduction, position creation
 *   - closePosition(): PnL calculation, balance return, history
 *   - reset(): restores starting balance
 *
 * jsdom environment (from vitest.config.ts) provides localStorage so Zustand's
 * persist middleware can initialise without errors.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePaperStore } from '../paperStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STARTING_BALANCE = 10_000;
const SYMBOL = 'BTCUSDT';

/** Resets the store and clears localStorage between every test. */
function resetStore() {
  usePaperStore.setState({ balance: STARTING_BALANCE, positions: [], history: [] });
  localStorage.clear();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('paperStore', () => {
  beforeEach(() => resetStore());

  // ── placeOrder() ───────────────────────────────────────────────────────────

  describe('placeOrder()', () => {
    it('returns a position id string on a valid buy order', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);
      expect(typeof id).toBe('string');
      expect(id).not.toBeNull();
    });

    it('deducts the USDT amount from balance on a buy', () => {
      usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);
      expect(usePaperStore.getState().balance).toBe(9_000);
    });

    it('deducts the USDT amount from balance on a sell (margin model)', () => {
      usePaperStore.getState().placeOrder(SYMBOL, 'sell', 50_000, 500);
      expect(usePaperStore.getState().balance).toBe(9_500);
    });

    it('creates a long position for a buy order', () => {
      usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);
      const { positions } = usePaperStore.getState();
      expect(positions).toHaveLength(1);
      expect(positions[0].side).toBe('long');
    });

    it('creates a short position for a sell order', () => {
      usePaperStore.getState().placeOrder(SYMBOL, 'sell', 50_000, 1_000);
      const { positions } = usePaperStore.getState();
      expect(positions).toHaveLength(1);
      expect(positions[0].side).toBe('short');
    });

    it('calculates quantity correctly (usdtAmount / price)', () => {
      usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);
      const pos = usePaperStore.getState().positions[0];
      expect(pos.quantity).toBeCloseTo(1_000 / 50_000);
    });

    it('returns null when the amount exceeds the balance', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 15_000);
      expect(id).toBeNull();
      expect(usePaperStore.getState().positions).toHaveLength(0);
    });

    it('returns null when the amount is zero', () => {
      expect(usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 0)).toBeNull();
    });

    it('returns null when the amount is negative', () => {
      expect(usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, -100)).toBeNull();
    });

    it('returns null when the price is zero', () => {
      expect(usePaperStore.getState().placeOrder(SYMBOL, 'buy', 0, 100)).toBeNull();
    });

    it('allows opening multiple positions', () => {
      usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 500);
      usePaperStore.getState().placeOrder(SYMBOL, 'sell', 50_000, 500);
      expect(usePaperStore.getState().positions).toHaveLength(2);
    });
  });

  // ── closePosition() ───────────────────────────────────────────────────────

  describe('closePosition()', () => {
    it('calculates positive PnL for a profitable long (exit > entry)', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 40_000, 4_000)!;
      // qty = 4000/40000 = 0.1 BTC
      // PnL = (50000 - 40000) * 0.1 = 1000
      usePaperStore.getState().closePosition(id, 50_000);
      const trade = usePaperStore.getState().history[0];
      expect(trade.pnl).toBeCloseTo(1_000);
    });

    it('calculates negative PnL for a losing long (exit < entry)', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 5_000)!;
      // qty = 5000/50000 = 0.1; PnL = (40000 - 50000) * 0.1 = -1000
      usePaperStore.getState().closePosition(id, 40_000);
      const trade = usePaperStore.getState().history[0];
      expect(trade.pnl).toBeCloseTo(-1_000);
    });

    it('calculates positive PnL for a profitable short (exit < entry)', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'sell', 50_000, 5_000)!;
      // qty = 0.1; PnL = (50000 - 40000) * 0.1 = 1000
      usePaperStore.getState().closePosition(id, 40_000);
      const trade = usePaperStore.getState().history[0];
      expect(trade.pnl).toBeCloseTo(1_000);
    });

    it('calculates negative PnL for a losing short (exit > entry)', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'sell', 40_000, 4_000)!;
      // qty = 0.1; PnL = (40000 - 50000) * 0.1 = -1000
      usePaperStore.getState().closePosition(id, 50_000);
      const trade = usePaperStore.getState().history[0];
      expect(trade.pnl).toBeCloseTo(-1_000);
    });

    it('returns margin + PnL to balance after a profitable long', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 40_000, 4_000)!;
      // balance after order = 6000
      // after close: 6000 + (4000 margin + 1000 PnL) = 11000
      usePaperStore.getState().closePosition(id, 50_000);
      expect(usePaperStore.getState().balance).toBeCloseTo(11_000);
    });

    it('floors balance return at 0 — balance never goes negative', () => {
      // Tiny position that loses more than 100% due to short squeeze edge case
      // Manually craft a scenario: buy 1000 at 100, price drops to 0
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 100, 1_000)!;
      // qty = 10; PnL = (0 - 100) * 10 = -1000 (wipes entire margin)
      usePaperStore.getState().closePosition(id, 0);
      // returnAmount = max(0, 1000 + (-1000)) = max(0, 0) = 0
      // balance = 9000 + 0 = 9000 (no negative balance)
      expect(usePaperStore.getState().balance).toBeGreaterThanOrEqual(0);
    });

    it('removes the closed position from active positions', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
      usePaperStore.getState().closePosition(id, 50_000);
      expect(usePaperStore.getState().positions).toHaveLength(0);
    });

    it('adds a ClosedTrade record to history', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
      usePaperStore.getState().closePosition(id, 55_000);
      expect(usePaperStore.getState().history).toHaveLength(1);
      expect(usePaperStore.getState().history[0].id).toBe(id);
    });

    it('records entryPrice, exitPrice and symbol on the closed trade', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
      usePaperStore.getState().closePosition(id, 55_000);
      const trade = usePaperStore.getState().history[0];
      expect(trade.entryPrice).toBe(50_000);
      expect(trade.exitPrice).toBe(55_000);
      expect(trade.symbol).toBe(SYMBOL);
    });

    it('caps history at 100 entries (MAX_HISTORY)', () => {
      // Open 101 positions and close them all
      for (let i = 0; i < 101; i++) {
        // Use tiny amounts to avoid running out of balance
        const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 10);
        if (id) usePaperStore.getState().closePosition(id, 50_000);
      }
      expect(usePaperStore.getState().history.length).toBeLessThanOrEqual(100);
    });

    it('does nothing when the positionId does not exist', () => {
      const balanceBefore = usePaperStore.getState().balance;
      usePaperStore.getState().closePosition('non-existent-id', 50_000);
      expect(usePaperStore.getState().balance).toBe(balanceBefore);
    });
  });

  // ── reset() ────────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('restores the starting balance', () => {
      usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 2_000);
      usePaperStore.getState().reset();
      expect(usePaperStore.getState().balance).toBe(STARTING_BALANCE);
    });

    it('clears all open positions', () => {
      usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);
      usePaperStore.getState().reset();
      expect(usePaperStore.getState().positions).toHaveLength(0);
    });

    it('clears trade history', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
      usePaperStore.getState().closePosition(id, 55_000);
      usePaperStore.getState().reset();
      expect(usePaperStore.getState().history).toHaveLength(0);
    });
  });
});
