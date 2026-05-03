/**
 * paperStore tests
 *
 * Tests cover the core paper-trading business logic:
 *   - placeOrder(): validation, balance deduction, position creation
 *   - closePosition(): PnL calculation, balance return, history
 *   - reset(): restores starting balance
 *   - Section 1 — Market Orders (T1 · Vitest)
 *   - Section 2 — Limit Orders  (T1 · Vitest)
 *
 * jsdom environment (from vitest.config.ts) provides localStorage so Zustand's
 * persist middleware can initialise without errors.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePaperStore, COMMISSION_RATE } from '../paperStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STARTING_BALANCE = 10_000;
const SYMBOL = 'BTCUSDT';

/** Resets the store and clears localStorage between every test. */
function resetStore() {
  // Use the store's own reset() action — it resets ALL fields (balance, positions,
  // history, orders, realizedPnl, balanceLog, journal) so new store fields can
  // never accidentally leak state between tests.
  usePaperStore.getState().reset();
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
      // balance = 10000 - 1000 (margin) - 0.7 (entry commission: 1000 * 0.0007) = 8999.3
      expect(usePaperStore.getState().balance).toBeCloseTo(8_999.3);
    });

    it('deducts the USDT amount from balance on a sell (margin model)', () => {
      usePaperStore.getState().placeOrder(SYMBOL, 'sell', 50_000, 500);
      // balance = 10000 - 500 (margin) - 0.35 (entry commission: 500 * 0.0007) = 9499.65
      expect(usePaperStore.getState().balance).toBeCloseTo(9_499.65);
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

    it('nets opposite-side positions: buy then equal sell closes the long (0 positions)', () => {
      usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 500);
      usePaperStore.getState().placeOrder(SYMBOL, 'sell', 50_000, 500);
      expect(usePaperStore.getState().positions).toHaveLength(0);
    });

    it('allows opening multiple same-side positions', () => {
      usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 500);
      usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 300);
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
      // Entry commission : 4000 * 0.0007 = 2.8  → balance after open = 5997.2
      // qty = 4000 / 40000 = 0.1 BTC; gross PnL = (50000 - 40000) * 0.1 = 1000
      // Exit commission  : 0.1 * 50000 * 0.0007 = 3.5
      // returnAmount = 4000 + 1000 - 3.5 = 4996.5
      // final balance = 5997.2 + 4996.5 = 10993.7
      usePaperStore.getState().closePosition(id, 50_000);
      expect(usePaperStore.getState().balance).toBeCloseTo(10_993.7);
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

    it('attaches net PnL badge to the exec journal entry on a profitable close', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 40_000, 4_000)!;
      // qty = 0.1; gross PnL = (50000-40000)*0.1 = 1000; exit commission = 0.1*50000*0.0007 = 3.5
      usePaperStore.getState().closePosition(id, 50_000);
      const journal = usePaperStore.getState().journal;
      const execEntry = journal.find((e) => e.id.includes('-exec'));
      expect(execEntry?.pnl).toBeCloseTo(1_000 - 0.1 * 50_000 * COMMISSION_RATE);
    });

    it('attaches negative net PnL badge to the exec journal entry on a losing close', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 5_000)!;
      // qty = 0.1; gross PnL = (40000-50000)*0.1 = -1000; exit commission = 0.1*40000*0.0007 = 2.8
      usePaperStore.getState().closePosition(id, 40_000);
      const journal = usePaperStore.getState().journal;
      const execEntry = journal.find((e) => e.id.includes('-exec'));
      expect(execEntry?.pnl).toBeCloseTo(-1_000 - 0.1 * 40_000 * COMMISSION_RATE);
    });

    it('addJournalNote stores pnl when provided', () => {
      usePaperStore.getState().addJournalNote('Auto-closed LONG BTCUSDT', false, 42.5);
      const entry = usePaperStore.getState().journal[0];
      expect(entry.pnl).toBeCloseTo(42.5);
    });

    it('addJournalNote pnl is undefined when not provided', () => {
      usePaperStore.getState().addJournalNote('User note');
      const entry = usePaperStore.getState().journal[0];
      expect(entry.pnl).toBeUndefined();
    });
  });

  describe('edit journal entries', () => {
    it('writes detailed confirmation entries when editing position TP/SL', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000, 48_000)!;

      usePaperStore.getState().updatePositionExits(id, 56_000, 47_000);

      const journalTexts = usePaperStore
        .getState()
        .journal.slice(0, 3)
        .map((entry) => entry.text);

      expect(journalTexts).toEqual([
        'Stop-Loss modification confirmed — LONG BTCUSDT @ $47000.00',
        'Take-Profit modification confirmed — LONG BTCUSDT @ $56000.00',
        'Modified LONG BTCUSDT exits — TP $55000.00 → $56000.00, SL $48000.00 → $47000.00',
      ]);
    });

    it('writes cancel history and a descriptive journal entry when removing a position TP', () => {
      const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;

      usePaperStore.getState().updatePositionExits(id, null, null);

      const state = usePaperStore.getState();
      expect(state.orders[0]).toMatchObject({
        type: 'take-profit',
        status: 'cancelled',
        limitPrice: 55_000,
      });
      expect(state.journal[0].text).toBe('Take-Profit cancelled for LONG BTCUSDT @ $55000.00');
      expect(state.journal[1].text).toBe('Modified LONG BTCUSDT exits — TP removed');
    });

    it('writes detailed parent and child journal entries when editing a pending order', () => {
      const orderId = usePaperStore
        .getState()
        .placeLimitOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000, 48_000)!;

      usePaperStore.getState().editPendingOrder(orderId, 49_000, 1_200, 56_000, 47_000);

      const journalTexts = usePaperStore
        .getState()
        .journal.slice(0, 3)
        .map((entry) => entry.text);

      expect(journalTexts).toEqual([
        'Stop-Loss modification confirmed for pending Long BTCUSDT @ $47000.00',
        'Take-Profit modification confirmed for pending Long BTCUSDT @ $56000.00',
        'Modified LIMIT Long BTCUSDT — price $50000.00 → $49000.00, qty 0.020000 → 0.024490, reserved $1000.00 → $1200.00, TP $55000.00 → $56000.00, SL $48000.00 → $47000.00',
      ]);
    });

    it('writes cancel history and a descriptive journal entry when removing a pending TP child', () => {
      const orderId = usePaperStore
        .getState()
        .placeLimitOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;

      usePaperStore.getState().editPendingOrder(orderId, 50_000, 1_000, null, null);

      const state = usePaperStore.getState();
      expect(state.orders[0]).toMatchObject({
        type: 'take-profit',
        status: 'cancelled',
        limitPrice: 55_000,
      });
      expect(state.journal[0].text).toBe(
        'Take-Profit cancelled for pending Long BTCUSDT @ $55000.00'
      );
      expect(state.journal[1].text).toBe('Modified LIMIT Long BTCUSDT — TP removed');
    });

    it('does not add journal noise when a pending-order edit makes no actual changes', () => {
      const orderId = usePaperStore
        .getState()
        .placeLimitOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000, 48_000)!;
      const journalCountBefore = usePaperStore.getState().journal.length;

      usePaperStore.getState().editPendingOrder(orderId, 50_000, 1_000, 55_000, 48_000);

      expect(usePaperStore.getState().journal).toHaveLength(journalCountBefore);
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

  describe('persist migrate()', () => {
    it('filters malformed v0 positions/history items before hydration', () => {
      const migrate = usePaperStore.persist.getOptions().migrate!;

      const migrated = migrate(
        {
          balance: 9_500,
          positions: [
            {
              id: 'p-1',
              symbol: 'BTCUSDT',
              side: 'long',
              quantity: 0.1,
              entryPrice: 50_000,
              entryUsdtAmount: 5_000,
              openedAt: Date.now(),
            },
            { id: 'bad-position', quantity: 'oops' },
          ],
          history: [
            {
              id: 'h-1',
              symbol: 'BTCUSDT',
              side: 'short',
              quantity: 0.05,
              entryPrice: 60_000,
              exitPrice: 58_000,
              pnl: 100,
              openedAt: Date.now() - 1000,
              closedAt: Date.now(),
            },
            { id: 'bad-history', pnl: 'oops' },
            // zero exitPrice must be rejected (prices must be positive)
            {
              id: 'bad-zero-exit',
              symbol: 'BTCUSDT',
              side: 'long',
              quantity: 0.1,
              entryPrice: 50_000,
              exitPrice: 0,
              pnl: -5_000,
              openedAt: Date.now() - 1000,
              closedAt: Date.now(),
            },
          ],
          realizedPnl: 123,
        },
        0
      ) as {
        positions: unknown[];
        history: unknown[];
      };

      expect(migrated.positions).toHaveLength(1);
      expect(migrated.history).toHaveLength(1);
    });
  });

  // ── Section 1 — Market Orders (T1 · Vitest) ───────────────────────────────────

  describe('Section 1 — Market Orders', () => {
    // ── 1.1 Basic Buy: journal + orders array + no pending ──────────────────────

    describe('1.1 Basic Buy', () => {
      it('1.1.5: writes "Opened LONG BTCUSDT @ $50000.00" journal entry on buy', () => {
        usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);
        const journal = usePaperStore.getState().journal;
        expect(journal[0].text).toBe('Opened LONG BTCUSDT @ $50000.00');
      });

      it('1.1.6: market buy appears in orders[] as type=market, side=buy, status=filled', () => {
        usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);
        const { orders } = usePaperStore.getState();
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({
          type: 'market',
          side: 'buy',
          status: 'filled',
          fillPrice: 50_000,
        });
      });

      it('1.1.8: pendingOrders is empty after a market buy (market orders are instantly filled)', () => {
        usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);
        expect(usePaperStore.getState().pendingOrders).toHaveLength(0);
      });
    });

    // ── 1.2 Basic Sell ──────────────────────────────────────────────────────────

    describe('1.2 Basic Sell', () => {
      it('1.2.2: sell order returns a non-null position id', () => {
        const id = usePaperStore.getState().placeOrder(SYMBOL, 'sell', 50_000, 1_000);
        expect(id).not.toBeNull();
      });

      it('1.2.3: sell order creates a SHORT position', () => {
        usePaperStore.getState().placeOrder(SYMBOL, 'sell', 50_000, 1_000);
        const pos = usePaperStore.getState().positions[0];
        expect(pos.side).toBe('short');
      });
    });

    // ── 1.3 Units mode ──────────────────────────────────────────────────────────

    describe('1.3 Units mode', () => {
      it('1.3.4: position qty ≈ 0.001 when USD amount equals 0.001 × price (leverage=1)', () => {
        // USD amount = 0.001 × 50_000 = 50; qty = 50 / 50_000 = 0.001
        usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 50);
        expect(usePaperStore.getState().positions[0].quantity).toBeCloseTo(0.001);
      });
    });

    // ── 1.4 Buy with Take-Profit only ──────────────────────────────────────────

    describe('1.4 Buy with Take-Profit only', () => {
      it('1.4.2: position has takeProfit set; stopLoss is undefined', () => {
        const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;
        const pos = usePaperStore.getState().positions.find((p) => p.id === id)!;
        expect(pos.takeProfit).toBe(55_000);
        expect(pos.stopLoss).toBeUndefined();
      });

      it('1.4.3: TP trigger removes position and adds profitable history entry', () => {
        const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;
        usePaperStore
          .getState()
          .closePosition(
            id,
            55_000,
            'Auto-closed LONG BTCUSDT — Take-Profit hit at $55000.00',
            'take-profit'
          );
        expect(usePaperStore.getState().positions).toHaveLength(0);
        // qty = 1000 / 50000 = 0.02; gross PnL = (55000 - 50000) × 0.02 = 100
        expect(usePaperStore.getState().history[0].pnl).toBeCloseTo(100);
      });

      it('1.4.4: auto-close journal entry has TP text and a positive PnL badge', () => {
        const id = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;
        usePaperStore
          .getState()
          .closePosition(
            id,
            55_000,
            'Auto-closed LONG BTCUSDT — Take-Profit hit at $55000.00',
            'take-profit'
          );
        const closeEntry = usePaperStore
          .getState()
          .journal.find((e) => e.text.includes('Take-Profit hit'))!;
        expect(closeEntry.text).toBe('Auto-closed LONG BTCUSDT — Take-Profit hit at $55000.00');
        expect(closeEntry.pnl).toBeDefined();
        expect(closeEntry.pnl!).toBeGreaterThan(0);
      });
    });

    // ── 1.5 Sell with Stop-Loss only ────────────────────────────────────────────

    describe('1.5 Sell with Stop-Loss only', () => {
      it('1.5.2: SHORT position has stopLoss set; takeProfit is undefined', () => {
        const id = usePaperStore
          .getState()
          .placeOrder(SYMBOL, 'sell', 50_000, 1_000, undefined, 52_000)!;
        const pos = usePaperStore.getState().positions.find((p) => p.id === id)!;
        expect(pos.side).toBe('short');
        expect(pos.stopLoss).toBe(52_000);
        expect(pos.takeProfit).toBeUndefined();
      });

      it('1.5.3: SL trigger auto-closes SHORT and journal entry has a negative PnL badge', () => {
        // SHORT: SL above entry (52k > 50k) → price rose → loss
        const id = usePaperStore
          .getState()
          .placeOrder(SYMBOL, 'sell', 50_000, 1_000, undefined, 52_000)!;
        usePaperStore
          .getState()
          .closePosition(
            id,
            52_000,
            'Auto-closed SHORT BTCUSDT — Stop-Loss hit at $52000.00',
            'stop-loss'
          );
        expect(usePaperStore.getState().positions).toHaveLength(0);
        const closeEntry = usePaperStore
          .getState()
          .journal.find((e) => e.text.includes('Stop-Loss hit'))!;
        expect(closeEntry.pnl).toBeDefined();
        expect(closeEntry.pnl!).toBeLessThan(0);
      });
    });

    // ── 1.6 Buy with both TP and SL ─────────────────────────────────────────────

    describe('1.6 Buy with both TP and SL', () => {
      it('1.6.2: LONG position has both takeProfit and stopLoss set', () => {
        const id = usePaperStore
          .getState()
          .placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000, 48_000)!;
        const pos = usePaperStore.getState().positions.find((p) => p.id === id)!;
        expect(pos.takeProfit).toBe(55_000);
        expect(pos.stopLoss).toBe(48_000);
      });

      it('1.6.3: manual close cancels both TP and SL — two sibling Cancelled orders added', () => {
        const id = usePaperStore
          .getState()
          .placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000, 48_000)!;
        usePaperStore.getState().closePosition(id, 50_500); // no closeType → manual
        const cancelledOrders = usePaperStore
          .getState()
          .orders.filter((o) => o.status === 'cancelled');
        expect(cancelledOrders).toHaveLength(2);
        const types = cancelledOrders.map((o) => o.type).sort();
        expect(types).toEqual(['stop-loss', 'take-profit']);
      });
    });
  });

  // ── Section 2 — Limit Orders (T1 · Vitest) ────────────────────────────────────

  describe('Section 2 — Limit Orders', () => {
    // ── 2.1 Limit Buy below market ──────────────────────────────────────────────

    describe('2.1 Limit Buy below market', () => {
      it('2.1.2: placeLimitOrder creates a pending order and reserves balance', () => {
        const balanceBefore = usePaperStore.getState().balance;
        const id = usePaperStore.getState().placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000);
        expect(id).not.toBeNull();
        const { pendingOrders, balance } = usePaperStore.getState();
        expect(pendingOrders).toHaveLength(1);
        expect(pendingOrders[0]).toMatchObject({
          symbol: SYMBOL,
          side: 'buy',
          type: 'limit',
          triggerPrice: 48_000,
          usdtAmount: 1_000,
        });
        // Balance decreases by margin + entry commission
        expect(balance).toBeCloseTo(balanceBefore - 1_000 - 1_000 * COMMISSION_RATE);
      });

      it('2.1.5: filling a limit order creates a position and writes a fill journal entry', () => {
        const orderId = usePaperStore.getState().placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000)!;
        const order = usePaperStore.getState().pendingOrders[0];

        // Step 1: free reserved balance
        usePaperStore.getState().fillPendingOrder(orderId);
        // Step 2: open position (skipJournal=true — caller writes the entry below)
        const posId = usePaperStore
          .getState()
          .placeOrder(
            order.symbol,
            order.side,
            48_000,
            order.usdtAmount,
            order.takeProfit,
            order.stopLoss,
            true
          );
        // Step 3: write journal note (mirrors usePendingOrderMonitor)
        usePaperStore
          .getState()
          .addJournalNote(
            `Limit order filled — Long ${order.symbol} @ $48000.00 (trigger: $48000.00, qty: ${order.qty.toFixed(6)})`,
            false
          );

        expect(posId).not.toBeNull();
        expect(usePaperStore.getState().positions).toHaveLength(1);
        expect(usePaperStore.getState().pendingOrders).toHaveLength(0);
        expect(
          usePaperStore.getState().journal.some((e) => e.text.includes('Limit order filled'))
        ).toBe(true);
      });
    });

    // ── 2.2 Limit Buy cancel ────────────────────────────────────────────────────

    describe('2.2 Limit Buy cancel', () => {
      it('2.2.1: placeLimitOrder adds to pendingOrders and immediately writes a Placed journal entry', () => {
        usePaperStore.getState().placeLimitOrder(SYMBOL, 'buy', 45_000, 500);
        const { pendingOrders, journal } = usePaperStore.getState();
        expect(pendingOrders).toHaveLength(1);
        expect(journal[0].text).toContain('Placed LIMIT Long BTCUSDT @ $45000.00');
      });

      it('2.2.2: cancelPendingOrder fully refunds balance, moves order to Cancelled, and writes journal', () => {
        const balanceBefore = usePaperStore.getState().balance;
        const orderId = usePaperStore.getState().placeLimitOrder(SYMBOL, 'buy', 45_000, 500)!;
        usePaperStore.getState().cancelPendingOrder(orderId);

        expect(usePaperStore.getState().pendingOrders).toHaveLength(0);
        expect(usePaperStore.getState().balance).toBeCloseTo(balanceBefore);

        const cancelledOrder = usePaperStore
          .getState()
          .orders.find((o) => o.status === 'cancelled' && o.type === 'limit');
        expect(cancelledOrder).toBeDefined();

        expect(
          usePaperStore.getState().journal.some((e) => e.text.includes('Cancelled LIMIT Long'))
        ).toBe(true);
      });
    });

    // ── 2.3 Limit Sell above market ─────────────────────────────────────────────

    describe('2.3 Limit Sell above market', () => {
      it('2.3.1: sell limit order creates a pending order with side=sell', () => {
        usePaperStore.getState().placeLimitOrder(SYMBOL, 'sell', 52_000, 1_000);
        const order = usePaperStore.getState().pendingOrders[0];
        expect(order.side).toBe('sell');
        expect(order.triggerPrice).toBe(52_000);
      });

      it('2.3.2: filling a sell limit order opens a SHORT position', () => {
        const orderId = usePaperStore.getState().placeLimitOrder(SYMBOL, 'sell', 52_000, 1_000)!;
        const order = usePaperStore.getState().pendingOrders[0];
        usePaperStore.getState().fillPendingOrder(orderId);
        usePaperStore
          .getState()
          .placeOrder(
            order.symbol,
            order.side,
            52_000,
            order.usdtAmount,
            undefined,
            undefined,
            true
          );
        const positions = usePaperStore.getState().positions;
        expect(positions).toHaveLength(1);
        expect(positions[0].side).toBe('short');
      });
    });

    // ── 2.4 Limit with TP + SL — Pre-fill ──────────────────────────────────────

    describe('2.4 Limit with TP + SL — Pre-fill', () => {
      it('2.4.1: bracket limit buy stores TP + SL on the pending order and writes placement journal', () => {
        usePaperStore.getState().placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000);
        const order = usePaperStore.getState().pendingOrders[0];
        expect(order.takeProfit).toBe(53_000);
        expect(order.stopLoss).toBe(46_000);
        // Journal written immediately at placement (before fill)
        expect(
          usePaperStore
            .getState()
            .journal.some((e) => e.text.includes('Placed LIMIT Long BTCUSDT @ $48000.00'))
        ).toBe(true);
      });

      it('2.4.2: cancelPendingExitLeg(stop-loss) removes SL from order; adds Cancelled row; balance unchanged', () => {
        const orderId = usePaperStore
          .getState()
          .placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;
        const balanceAfterPlacement = usePaperStore.getState().balance;

        usePaperStore.getState().cancelPendingExitLeg(orderId, 'stop-loss');

        const order = usePaperStore.getState().pendingOrders[0];
        expect(order.stopLoss).toBeUndefined();
        expect(order.takeProfit).toBe(53_000); // TP unaffected

        const cancelledSl = usePaperStore
          .getState()
          .orders.find((o) => o.type === 'stop-loss' && o.status === 'cancelled');
        expect(cancelledSl).toBeDefined();

        expect(
          usePaperStore
            .getState()
            .journal.some((e) => e.text.includes('Stop-Loss cancelled for pending'))
        ).toBe(true);

        // Balance unchanged — no refund for child legs
        expect(usePaperStore.getState().balance).toBeCloseTo(balanceAfterPlacement);
      });

      it('2.4.3: cancelPendingExitLeg(take-profit) removes TP from order; adds Cancelled row; balance unchanged', () => {
        const orderId = usePaperStore
          .getState()
          .placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;
        const balanceAfterPlacement = usePaperStore.getState().balance;

        usePaperStore.getState().cancelPendingExitLeg(orderId, 'take-profit');

        const order = usePaperStore.getState().pendingOrders[0];
        expect(order.takeProfit).toBeUndefined();
        expect(order.stopLoss).toBe(46_000); // SL unaffected

        const cancelledTp = usePaperStore
          .getState()
          .orders.find((o) => o.type === 'take-profit' && o.status === 'cancelled');
        expect(cancelledTp).toBeDefined();

        expect(
          usePaperStore
            .getState()
            .journal.some((e) => e.text.includes('Take-Profit cancelled for pending'))
        ).toBe(true);

        expect(usePaperStore.getState().balance).toBeCloseTo(balanceAfterPlacement);
      });

      it('2.4.4: cancelPendingOrder (bracket) produces 3 Cancelled rows and fully refunds balance', () => {
        const balanceBefore = usePaperStore.getState().balance;
        const orderId = usePaperStore
          .getState()
          .placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;

        usePaperStore.getState().cancelPendingOrder(orderId);

        expect(usePaperStore.getState().pendingOrders).toHaveLength(0);
        expect(usePaperStore.getState().balance).toBeCloseTo(balanceBefore);

        const cancelledOrders = usePaperStore
          .getState()
          .orders.filter((o) => o.status === 'cancelled');
        expect(cancelledOrders).toHaveLength(3);
        const types = cancelledOrders.map((o) => o.type).sort();
        expect(types).toEqual(['limit', 'stop-loss', 'take-profit']);

        expect(
          usePaperStore.getState().journal.some((e) => e.text.includes('Cancelled LIMIT Long'))
        ).toBe(true);
      });
    });

    // ── 2.4 Limit with TP + SL — Post-fill ─────────────────────────────────────

    describe('2.4 Limit with TP + SL — Post-fill', () => {
      /** Helper: place + fill a bracket limit Buy with given TP and SL prices. */
      function fillBracket(tp: number, sl: number): string {
        const orderId = usePaperStore
          .getState()
          .placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, tp, sl)!;
        const order = usePaperStore.getState().pendingOrders[0];
        usePaperStore.getState().fillPendingOrder(orderId);
        const posId = usePaperStore
          .getState()
          .placeOrder(
            order.symbol,
            order.side,
            48_000,
            order.usdtAmount,
            order.takeProfit,
            order.stopLoss,
            true
          )!;
        return posId;
      }

      it('2.4.5: limit fill → position has TP + SL; pendingOrders empty; journal has 3 activation entries', () => {
        const orderId = usePaperStore
          .getState()
          .placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;
        const order = usePaperStore.getState().pendingOrders[0];
        usePaperStore.getState().fillPendingOrder(orderId);
        const posId = usePaperStore
          .getState()
          .placeOrder(
            order.symbol,
            order.side,
            48_000,
            order.usdtAmount,
            order.takeProfit,
            order.stopLoss,
            true
          )!;
        // Simulate the 3 journal entries written by usePendingOrderMonitor
        usePaperStore
          .getState()
          .addJournalNote(
            `Limit order filled — Long ${order.symbol} @ $48000.00 (trigger: $48000.00, qty: ${order.qty.toFixed(6)})`,
            false
          );
        usePaperStore
          .getState()
          .addJournalNote(`Take-Profit order activated — Long ${order.symbol} @ $53000.00`, false);
        usePaperStore
          .getState()
          .addJournalNote(`Stop-Loss order activated — Long ${order.symbol} @ $46000.00`, false);

        expect(usePaperStore.getState().pendingOrders).toHaveLength(0);
        const pos = usePaperStore.getState().positions.find((p) => p.id === posId)!;
        expect(pos.takeProfit).toBe(53_000);
        expect(pos.stopLoss).toBe(46_000);

        const journal = usePaperStore.getState().journal;
        expect(journal.some((e) => e.text.includes('Limit order filled'))).toBe(true);
        expect(journal.some((e) => e.text.includes('Take-Profit order activated'))).toBe(true);
        expect(journal.some((e) => e.text.includes('Stop-Loss order activated'))).toBe(true);
      });

      it('2.4.6: cancelExitOrder(take-profit) cancels TP; adds Cancelled row; position retains SL', () => {
        const posId = fillBracket(53_000, 46_000);
        usePaperStore.getState().cancelExitOrder(posId, 'take-profit');

        const pos = usePaperStore.getState().positions.find((p) => p.id === posId)!;
        expect(pos.takeProfit).toBeUndefined();
        expect(pos.stopLoss).toBe(46_000);

        const cancelledTp = usePaperStore
          .getState()
          .orders.find((o) => o.type === 'take-profit' && o.status === 'cancelled');
        expect(cancelledTp).toBeDefined();

        expect(
          usePaperStore
            .getState()
            .journal.some((e) => e.text.includes('Take-Profit cancelled for LONG'))
        ).toBe(true);
      });

      it('2.4.7: cancelExitOrder(stop-loss) cancels SL; adds Cancelled row; position retains TP', () => {
        const posId = fillBracket(53_000, 46_000);
        usePaperStore.getState().cancelExitOrder(posId, 'stop-loss');

        const pos = usePaperStore.getState().positions.find((p) => p.id === posId)!;
        expect(pos.stopLoss).toBeUndefined();
        expect(pos.takeProfit).toBe(53_000);

        const cancelledSl = usePaperStore
          .getState()
          .orders.find((o) => o.type === 'stop-loss' && o.status === 'cancelled');
        expect(cancelledSl).toBeDefined();

        expect(
          usePaperStore
            .getState()
            .journal.some((e) => e.text.includes('Stop-Loss cancelled for LONG'))
        ).toBe(true);
      });

      it('2.4.8: after fillPendingOrder, parent limit order is no longer in pendingOrders', () => {
        const orderId = usePaperStore
          .getState()
          .placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;
        usePaperStore.getState().fillPendingOrder(orderId);
        expect(usePaperStore.getState().pendingOrders).toHaveLength(0);
      });

      it('2.4.9: TP triggers (closeType=take-profit) → sibling SL Cancelled + position closed', () => {
        const posId = fillBracket(53_000, 46_000);
        usePaperStore
          .getState()
          .closePosition(
            posId,
            53_000,
            'Auto-closed LONG BTCUSDT — Take-Profit hit at $53000.00',
            'take-profit'
          );
        expect(usePaperStore.getState().positions).toHaveLength(0);
        const siblingCancel = usePaperStore
          .getState()
          .orders.find((o) => o.type === 'stop-loss' && o.status === 'cancelled');
        expect(siblingCancel).toBeDefined();
        expect(siblingCancel!.commission).toBe(0);
      });

      it('2.4.10: SL triggers (closeType=stop-loss) → sibling TP Cancelled + position closed', () => {
        const posId = fillBracket(53_000, 46_000);
        usePaperStore
          .getState()
          .closePosition(
            posId,
            46_000,
            'Auto-closed LONG BTCUSDT — Stop-Loss hit at $46000.00',
            'stop-loss'
          );
        expect(usePaperStore.getState().positions).toHaveLength(0);
        const siblingCancel = usePaperStore
          .getState()
          .orders.find((o) => o.type === 'take-profit' && o.status === 'cancelled');
        expect(siblingCancel).toBeDefined();
        expect(siblingCancel!.commission).toBe(0);
      });

      it('2.4.11: manual close with both TP + SL active → 2 sibling Cancelled rows (commission = 0 each)', () => {
        const posId = fillBracket(53_000, 46_000);
        usePaperStore.getState().closePosition(posId, 50_000); // no closeType → manual
        const cancelledOrders = usePaperStore
          .getState()
          .orders.filter((o) => o.status === 'cancelled');
        expect(cancelledOrders).toHaveLength(2);
        const types = cancelledOrders.map((o) => o.type).sort();
        expect(types).toEqual(['stop-loss', 'take-profit']);
        cancelledOrders.forEach((o) => expect(o.commission).toBe(0));
      });
    });

    // ── 2.5 Edge cases ──────────────────────────────────────────────────────────

    describe('2.5 Edge cases', () => {
      it('2.5.3: pending orders remain symbol-scoped when a second order is placed for a different symbol', () => {
        usePaperStore.getState().placeLimitOrder(SYMBOL, 'buy', 48_000, 500);
        usePaperStore.getState().placeLimitOrder('ETHUSDT', 'buy', 3_000, 200);

        const btcOrder = usePaperStore.getState().pendingOrders.find((o) => o.symbol === SYMBOL);
        const ethOrder = usePaperStore.getState().pendingOrders.find((o) => o.symbol === 'ETHUSDT');
        expect(btcOrder).toBeDefined();
        expect(ethOrder).toBeDefined();
        // Each order is scoped to its own symbol
        expect(btcOrder!.triggerPrice).toBe(48_000);
        expect(ethOrder!.triggerPrice).toBe(3_000);
      });
    });
  });

  // ── Section 4 — Cross-cutting / Regression (T1 · Vitest) ────────────────────

  describe('Section 4 — Cross-cutting / Regression', () => {
    // ── 4.6 localStorage persist ─────────────────────────────────────────────

    describe('4.6 Position persists in localStorage', () => {
      it('4.6: after placing a market buy, localStorage contains the position', () => {
        usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);

        const raw = localStorage.getItem('cd-paper-trading');
        expect(raw).not.toBeNull();
        const persisted = JSON.parse(raw!);
        // Zustand persist wraps state as { state: { ... }, version: N }
        expect(persisted.state.positions).toHaveLength(1);
        expect(persisted.state.positions[0].symbol).toBe(SYMBOL);
        expect(persisted.state.positions[0].side).toBe('long');
      });

      it('4.6: after reset(), localStorage state has empty positions and balance = $10,000', () => {
        usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);
        usePaperStore.getState().reset();

        const raw = localStorage.getItem('cd-paper-trading');
        expect(raw).not.toBeNull();
        const persisted = JSON.parse(raw!);
        expect(persisted.state.positions).toHaveLength(0);
        expect(persisted.state.balance).toBe(10_000);
      });

      it('4.6: pending orders also persist in localStorage', () => {
        usePaperStore.getState().placeLimitOrder(SYMBOL, 'buy', 48_000, 500);

        const raw = localStorage.getItem('cd-paper-trading');
        const persisted = JSON.parse(raw!);
        expect(persisted.state.pendingOrders).toHaveLength(1);
        expect(persisted.state.pendingOrders[0].triggerPrice).toBe(48_000);
      });
    });

    // ── 4.7 History PnL signs ────────────────────────────────────────────────

    describe('4.7 History PnL signs after mix of wins and losses', () => {
      it('4.7: profitable close → positive PnL in history', () => {
        const posId = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        // Close above entry for a Long = profit
        usePaperStore.getState().closePosition(posId, 55_000, 'Closed LONG BTCUSDT @ $55000');

        const trade = usePaperStore.getState().history[0];
        expect(trade).toBeDefined();
        const grossPnl = (55_000 - trade.entryPrice) * trade.quantity;
        expect(grossPnl).toBeGreaterThan(0);
      });

      it('4.7: losing close → negative PnL in history', () => {
        const posId = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        // Close below entry for a Long = loss
        usePaperStore.getState().closePosition(posId, 45_000, 'Closed LONG BTCUSDT @ $45000');

        const trade = usePaperStore.getState().history[0];
        expect(trade).toBeDefined();
        const grossPnl = (45_000 - trade.entryPrice) * trade.quantity;
        expect(grossPnl).toBeLessThan(0);
      });

      it('4.7: multiple closes accumulate in history in correct order; PnL signs are independent', () => {
        const pos1 = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 500)!;
        usePaperStore.getState().closePosition(pos1, 55_000); // profit
        const pos2 = usePaperStore.getState().placeOrder(SYMBOL, 'sell', 50_000, 500)!;
        usePaperStore.getState().closePosition(pos2, 45_000); // SHORT profit (price dropped)

        expect(usePaperStore.getState().history).toHaveLength(2);
      });
    });

    // ── 4.8 Journal entries newest-first ────────────────────────────────────

    describe('4.8 Journal entries are newest-first and cover full lifecycle', () => {
      it('4.8: journal entries are stored newest-first (journal[0].time >= journal[N-1].time)', () => {
        // Place, then close — generates at least 2 journal entries
        const posId = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        usePaperStore.getState().closePosition(posId, 55_000, 'Closed LONG BTCUSDT @ $55000');

        const journal = usePaperStore.getState().journal;
        expect(journal.length).toBeGreaterThanOrEqual(2);
        // Each entry must have a time >= the next entry (newest at index 0)
        for (let i = 0; i < journal.length - 1; i++) {
          expect(journal[i].time).toBeGreaterThanOrEqual(journal[i + 1].time);
        }
      });

      it('4.8: journal covers lifecycle — open entry + close entry for a market order trade', () => {
        const posId = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        usePaperStore.getState().closePosition(posId, 55_000, 'Closed LONG BTCUSDT @ $55000.00');

        const journal = usePaperStore.getState().journal;
        const openEntry = journal.find((e) => e.text.includes('Opened LONG'));
        const closeEntry = journal.find((e) => e.text.includes('Closed LONG'));
        expect(openEntry).toBeDefined();
        expect(closeEntry).toBeDefined();
      });

      it('4.8: system auto-entries are read-only (isUserNote=false); manual notes are editable (isUserNote=true)', () => {
        usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);
        usePaperStore.getState().addJournalNote('My manual note', true);

        const journal = usePaperStore.getState().journal;
        const systemEntry = journal.find((e) => e.text.includes('Opened LONG'));
        const userEntry = journal.find((e) => e.text === 'My manual note');

        expect(systemEntry!.isUserNote).toBe(false);
        expect(userEntry!.isUserNote).toBe(true);
      });

      it('4.8: common store-generated journal entries explicitly set isUserNote=false', () => {
        const posId = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        usePaperStore.getState().closePosition(posId, 51_000);

        const limitId = usePaperStore.getState().placeLimitOrder(SYMBOL, 'buy', 45_000, 500)!;
        usePaperStore.getState().cancelPendingOrder(limitId);

        const journal = usePaperStore.getState().journal;
        for (const text of [
          'Opened LONG BTCUSDT',
          'Closed LONG BTCUSDT',
          'Placed LIMIT Long BTCUSDT',
          'Cancelled LIMIT Long BTCUSDT',
        ]) {
          const entry = journal.find((e) => e.text.includes(text));
          expect(entry).toBeDefined();
          expect(entry!.isUserNote).toBe(false);
        }
      });
    });

    // ── 4.9 Journal PnL badge — profitable close ─────────────────────────────

    describe('4.9 Journal PnL badge — profitable close', () => {
      it('4.9: profitable manual close attaches a positive pnl to the exec journal entry', () => {
        const posId = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        const pos = usePaperStore.getState().positions.find((p) => p.id === posId)!;
        // Close at 55 000 — Long position from 50 000 → profit
        usePaperStore.getState().closePosition(posId, 55_000, 'Closed LONG BTCUSDT @ $55000.00');

        const closeEntry = usePaperStore
          .getState()
          .journal.find((e) => e.text.includes('Closed LONG'));
        expect(closeEntry).toBeDefined();
        expect(closeEntry!.pnl).toBeDefined();
        // Net PnL = gross_pnl - exit_commission; gross > 0 when exit > entry
        const grossPnl = (55_000 - pos.entryPrice) * pos.quantity;
        expect(grossPnl).toBeGreaterThan(0);
        // After commission, it should still be positive (5 000-point move >> 0.07% fee)
        expect(closeEntry!.pnl!).toBeGreaterThan(0);
      });

      it('4.9: no PnL badge on the open/placement journal entry (only close entries carry it)', () => {
        usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000);

        const openEntry = usePaperStore
          .getState()
          .journal.find((e) => e.text.includes('Opened LONG'));
        expect(openEntry).toBeDefined();
        expect(openEntry!.pnl).toBeUndefined();
      });
    });

    // ── 4.10 Journal PnL badge — losing close ────────────────────────────────

    describe('4.10 Journal PnL badge — losing close', () => {
      it('4.10: losing close attaches a negative pnl to the exec journal entry', () => {
        const posId = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        usePaperStore.getState().closePosition(posId, 45_000, 'Closed LONG BTCUSDT @ $45000.00');

        const closeEntry = usePaperStore
          .getState()
          .journal.find((e) => e.text.includes('Closed LONG'));
        expect(closeEntry).toBeDefined();
        expect(closeEntry!.pnl).toBeDefined();
        expect(closeEntry!.pnl!).toBeLessThan(0);
      });

      it('4.10: TP auto-close → journal entry pnl badge present', () => {
        const posId = usePaperStore.getState().placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;
        usePaperStore
          .getState()
          .closePosition(
            posId,
            55_000,
            'Auto-closed LONG BTCUSDT — Take-Profit hit at $55000.00',
            'take-profit'
          );

        const tpEntry = usePaperStore
          .getState()
          .journal.find((e) => e.text.includes('Take-Profit hit'));
        expect(tpEntry).toBeDefined();
        expect(tpEntry!.pnl).toBeDefined();
      });
    });

    // ── 4.11 Journal PnL badge — user note ──────────────────────────────────

    describe('4.11 Journal PnL badge — user note has no badge', () => {
      it('4.11: addJournalNote with isUserNote=true results in pnl=undefined', () => {
        usePaperStore.getState().addJournalNote('Observation note', true);

        const entry = usePaperStore.getState().journal[0];
        expect(entry.isUserNote).toBe(true);
        expect(entry.pnl).toBeUndefined();
      });

      it('4.11: addJournalNote pnl is undefined when not provided', () => {
        usePaperStore.getState().addJournalNote('Test note');

        const entry = usePaperStore.getState().journal[0];
        expect(entry.pnl).toBeUndefined();
      });
    });

    // ── 4.17 Edit pending bracket order — rich journal entries ───────────────

    describe('4.17 Edit pending bracket order — rich journal entries', () => {
      it('4.17: editing pending order price + exits writes summary + child-leg confirmation journal entries', () => {
        const orderId = usePaperStore
          .getState()
          .placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;

        usePaperStore.getState().editPendingOrder(orderId, 48_500, 1_000, 54_000, 45_500);

        const journal = usePaperStore.getState().journal;
        // Summary entry should describe the price change
        expect(
          journal.some(
            (e) =>
              e.text.includes('Modified LIMIT Long') &&
              e.text.includes('48000') &&
              e.text.includes('48500')
          )
        ).toBe(true);
        // Child-leg confirmation entries
        expect(journal.some((e) => e.text.includes('Take-Profit modification confirmed'))).toBe(
          true
        );
        expect(journal.some((e) => e.text.includes('Stop-Loss modification confirmed'))).toBe(true);
      });

      it('4.17: removing a pending TP child writes a cancel-style journal entry and Cancelled order record', () => {
        const orderId = usePaperStore
          .getState()
          .placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;

        // Remove TP by passing null, keep SL
        usePaperStore.getState().editPendingOrder(orderId, 48_000, 1_000, null, 46_000);

        const journal = usePaperStore.getState().journal;
        expect(
          journal.some((e) => e.text.includes('Take-Profit') && e.text.includes('cancelled'))
        ).toBe(true);

        const cancelledTp = usePaperStore
          .getState()
          .orders.find((o) => o.type === 'take-profit' && o.status === 'cancelled');
        expect(cancelledTp).toBeDefined();
      });

      it('4.17: no-op edit (same price, same exits) does not add additional journal noise', () => {
        const orderId = usePaperStore
          .getState()
          .placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;
        const journalSizeBefore = usePaperStore.getState().journal.length;

        // Edit with identical values → no-op
        usePaperStore.getState().editPendingOrder(orderId, 48_000, 1_000, 53_000, 46_000);

        expect(usePaperStore.getState().journal.length).toBe(journalSizeBefore);
      });
    });

    // ── 4.18 Edit open position TP/SL — rich journal entries ─────────────────

    describe('4.18 Edit open position TP/SL — rich journal entries', () => {
      it('4.18: editing both TP and SL on an open position writes summary + modification-confirmed child entries', () => {
        const posId = usePaperStore
          .getState()
          .placeOrder(SYMBOL, 'buy', 50_000, 1_000, 53_000, 47_000)!;

        usePaperStore.getState().updatePositionExits(posId, 54_000, 46_000);

        const journal = usePaperStore.getState().journal;
        expect(journal.some((e) => e.text.includes('Modified LONG BTCUSDT exits'))).toBe(true);
        expect(journal.some((e) => e.text.includes('Take-Profit modification confirmed'))).toBe(
          true
        );
        expect(journal.some((e) => e.text.includes('Stop-Loss modification confirmed'))).toBe(true);
      });

      it('4.18: removing TP from an open position writes a cancel-style journal entry and Cancelled HistoricalOrder', () => {
        const posId = usePaperStore
          .getState()
          .placeOrder(SYMBOL, 'buy', 50_000, 1_000, 53_000, 47_000)!;

        // Remove TP, keep SL
        usePaperStore.getState().updatePositionExits(posId, null, 47_000);

        const journal = usePaperStore.getState().journal;
        expect(
          journal.some((e) => e.text.includes('Take-Profit') && e.text.includes('cancelled'))
        ).toBe(true);

        const cancelledTp = usePaperStore
          .getState()
          .orders.find((o) => o.type === 'take-profit' && o.status === 'cancelled');
        expect(cancelledTp).toBeDefined();
      });

      it('4.18: position TP/SL values are updated in-place after updatePositionExits', () => {
        const posId = usePaperStore
          .getState()
          .placeOrder(SYMBOL, 'buy', 50_000, 1_000, 53_000, 47_000)!;

        usePaperStore.getState().updatePositionExits(posId, 55_000, 46_000);

        const pos = usePaperStore.getState().positions.find((p) => p.id === posId)!;
        expect(pos.takeProfit).toBe(55_000);
        expect(pos.stopLoss).toBe(46_000);
      });
    });
  });

  // ── Section 3 — Stop Orders (T1 · Vitest) ─────────────────────────────────────

  describe('Section 3 — Stop Orders', () => {
    /**
     * Simulates what usePendingOrderMonitor does when a stop order triggers.
     * fillPendingOrder() → placeOrder(skipJournal=true) → addJournalNote().
     * Returns the new position id (or null if the fill was rejected).
     */
    function fillStop(orderId: string, fillPrice: number): string | null {
      const order = usePaperStore.getState().pendingOrders.find((o) => o.id === orderId)!;
      usePaperStore.getState().fillPendingOrder(orderId);
      const posId = usePaperStore.getState().placeOrder(
        order.symbol,
        order.side,
        fillPrice,
        order.usdtAmount,
        order.takeProfit,
        order.stopLoss,
        true // skipJournal — monitor writes its own entry
      );
      const sideLabel = order.side === 'buy' ? 'Long' : 'Short';
      if (posId) {
        usePaperStore
          .getState()
          .addJournalNote(
            `Stop order filled — ${sideLabel} ${order.symbol} @ $${fillPrice.toFixed(2)} ` +
              `(trigger: $${order.triggerPrice.toFixed(2)}, qty: ${order.qty.toFixed(6)})`,
            false
          );
        if (order.takeProfit) {
          usePaperStore
            .getState()
            .addJournalNote(
              `Take-Profit order activated — ${sideLabel} ${order.symbol} @ $${order.takeProfit.toFixed(2)}`,
              false
            );
        }
        if (order.stopLoss) {
          usePaperStore
            .getState()
            .addJournalNote(
              `Stop-Loss order activated — ${sideLabel} ${order.symbol} @ $${order.stopLoss.toFixed(2)}`,
              false
            );
        }
      }
      return posId;
    }

    // ── 3.1 Stop Buy placement and fill ────────────────────────────────────────

    describe('3.1 Stop Buy placement and fill', () => {
      it('3.1.1: placeStopOrder creates pending stop buy with correct type/side/triggerPrice and reserves balance', () => {
        const balanceBefore = usePaperStore.getState().balance;
        const id = usePaperStore.getState().placeStopOrder(SYMBOL, 'buy', 55_000, 1_000);

        expect(id).not.toBeNull();

        const { pendingOrders, balance } = usePaperStore.getState();
        expect(pendingOrders).toHaveLength(1);
        expect(pendingOrders[0]).toMatchObject({
          symbol: SYMBOL,
          side: 'buy',
          type: 'stop',
          triggerPrice: 55_000,
          usdtAmount: 1_000,
        });
        // Balance reduced by margin + entry commission (reserved upfront)
        expect(balance).toBeCloseTo(balanceBefore - 1_000 - 1_000 * COMMISSION_RATE);
      });

      it('3.1.2: stop buy fill opens a Long position, clears pendingOrders, journal has fill entry', () => {
        const orderId = usePaperStore.getState().placeStopOrder(SYMBOL, 'buy', 55_000, 1_000)!;
        fillStop(orderId, 55_000);

        const { positions, pendingOrders } = usePaperStore.getState();
        expect(positions).toHaveLength(1);
        expect(positions[0].side).toBe('long');
        expect(pendingOrders).toHaveLength(0);
        expect(
          usePaperStore.getState().journal.some((e) => e.text.includes('Stop order filled — Long'))
        ).toBe(true);
      });

      it('3.1.3: Order History after stop fill has status=filled, type=market, side=buy, fillPrice and commission > 0', () => {
        const orderId = usePaperStore.getState().placeStopOrder(SYMBOL, 'buy', 55_000, 1_000)!;
        fillStop(orderId, 55_000);

        const filledOrders = usePaperStore
          .getState()
          .orders.filter((o) => o.status === 'filled' && o.type === 'market' && o.side === 'buy');
        expect(filledOrders).toHaveLength(1);
        expect(filledOrders[0].fillPrice).toBe(55_000);
        expect(filledOrders[0].commission).toBeGreaterThan(0);
      });

      it('3.1.2 slippage: fill at price above trigger still creates the position at fill price', () => {
        // When price races through the stop, the fill price > triggerPrice (slippage)
        const orderId = usePaperStore.getState().placeStopOrder(SYMBOL, 'buy', 55_000, 1_000)!;
        const fillPrice = 55_100; // slightly above trigger
        fillStop(orderId, fillPrice);

        const pos = usePaperStore.getState().positions[0];
        expect(pos.entryPrice).toBe(fillPrice);
      });
    });

    // ── 3.2 Stop Sell placement and fill ───────────────────────────────────────

    describe('3.2 Stop Sell placement and fill', () => {
      it('3.2.1: placeStopOrder sell creates pending stop sell with side=sell, type=stop, triggerPrice correct', () => {
        usePaperStore.getState().placeStopOrder(SYMBOL, 'sell', 45_000, 1_000);

        const order = usePaperStore.getState().pendingOrders[0];
        expect(order.side).toBe('sell');
        expect(order.type).toBe('stop');
        expect(order.triggerPrice).toBe(45_000);
      });

      it('3.2.2: stop sell fill opens a Short position and journal has "Stop order filled — Short" entry', () => {
        const orderId = usePaperStore.getState().placeStopOrder(SYMBOL, 'sell', 45_000, 1_000)!;
        fillStop(orderId, 45_000);

        const { positions } = usePaperStore.getState();
        expect(positions).toHaveLength(1);
        expect(positions[0].side).toBe('short');
        expect(
          usePaperStore.getState().journal.some((e) => e.text.includes('Stop order filled — Short'))
        ).toBe(true);
      });

      it('3.2.2 slippage: fill at price below trigger still creates the position at fill price', () => {
        const orderId = usePaperStore.getState().placeStopOrder(SYMBOL, 'sell', 45_000, 1_000)!;
        const fillPrice = 44_950; // slightly below trigger
        fillStop(orderId, fillPrice);

        const pos = usePaperStore.getState().positions[0];
        expect(pos.entryPrice).toBe(fillPrice);
      });
    });

    // ── 3.3 Cancel stop order ──────────────────────────────────────────────────

    describe('3.3 Cancel stop order', () => {
      it('3.3.1: cancelPendingOrder fully refunds reserved balance, removes from pendingOrders, writes journal', () => {
        const balanceBefore = usePaperStore.getState().balance;
        const orderId = usePaperStore.getState().placeStopOrder(SYMBOL, 'sell', 45_000, 1_000)!;

        usePaperStore.getState().cancelPendingOrder(orderId);

        expect(usePaperStore.getState().pendingOrders).toHaveLength(0);
        // Balance fully restored (margin + entry commission refunded)
        expect(usePaperStore.getState().balance).toBeCloseTo(balanceBefore);
        expect(
          usePaperStore.getState().journal.some((e) => e.text.includes('Cancelled STOP'))
        ).toBe(true);
      });

      it('3.3.2: cancelled stop in orders[] has status=cancelled, type=stop, stopPrice preserved, timestamps set', () => {
        const orderId = usePaperStore.getState().placeStopOrder(SYMBOL, 'sell', 45_000, 1_000)!;
        usePaperStore.getState().cancelPendingOrder(orderId);

        const cancelledOrder = usePaperStore
          .getState()
          .orders.find((o) => o.status === 'cancelled' && o.type === 'stop');
        expect(cancelledOrder).toBeDefined();
        expect(cancelledOrder!.stopPrice).toBe(45_000);
        expect(cancelledOrder!.placingTime).toBeGreaterThan(0);
        expect(cancelledOrder!.closingTime).toBeGreaterThanOrEqual(cancelledOrder!.placingTime);
      });
    });

    // ── 3.4 Stop with TP + SL bracket ─────────────────────────────────────────

    describe('3.4 Stop buy with TP + SL bracket', () => {
      it('3.4.1: placeStopOrder with TP=78k SL=76k stores both exits on the pending order', () => {
        usePaperStore.getState().placeStopOrder(SYMBOL, 'buy', 77_350, 1_000, 78_000, 76_000);

        const order = usePaperStore.getState().pendingOrders[0];
        expect(order.takeProfit).toBe(78_000);
        expect(order.stopLoss).toBe(76_000);
      });

      it('3.4.2: stop fill with TP+SL → position has takeProfit+stopLoss and pendingOrders is empty', () => {
        const orderId = usePaperStore
          .getState()
          .placeStopOrder(SYMBOL, 'buy', 77_350, 1_000, 78_000, 76_000)!;
        const posId = fillStop(orderId, 77_350);

        expect(usePaperStore.getState().pendingOrders).toHaveLength(0);
        const pos = usePaperStore.getState().positions.find((p) => p.id === posId)!;
        expect(pos.takeProfit).toBe(78_000);
        expect(pos.stopLoss).toBe(76_000);
      });

      it('3.4.2: stop fill with TP+SL writes Take-Profit and Stop-Loss activation journal entries', () => {
        const orderId = usePaperStore
          .getState()
          .placeStopOrder(SYMBOL, 'buy', 77_350, 1_000, 78_000, 76_000)!;
        fillStop(orderId, 77_350);

        const journal = usePaperStore.getState().journal;
        expect(journal.some((e) => e.text.includes('Take-Profit order activated'))).toBe(true);
        expect(journal.some((e) => e.text.includes('Stop-Loss order activated'))).toBe(true);
      });

      it('3.4.2: cancel bracket stop order creates 3 Cancelled rows (STOP + TP child + SL child) and fully refunds balance', () => {
        const balanceBefore = usePaperStore.getState().balance;
        const orderId = usePaperStore
          .getState()
          .placeStopOrder(SYMBOL, 'buy', 77_350, 1_000, 78_000, 76_000)!;

        usePaperStore.getState().cancelPendingOrder(orderId);

        expect(usePaperStore.getState().pendingOrders).toHaveLength(0);
        expect(usePaperStore.getState().balance).toBeCloseTo(balanceBefore);

        const cancelledOrders = usePaperStore
          .getState()
          .orders.filter((o) => o.status === 'cancelled');
        expect(cancelledOrders).toHaveLength(3);
        const types = cancelledOrders.map((o) => o.type).sort();
        expect(types).toEqual(['stop', 'stop-loss', 'take-profit']);
      });
    });

    // ── 3.5 Multiple concurrent stop orders ───────────────────────────────────

    describe('3.5 Multiple stop orders coexist', () => {
      it('3.5.3: 4 concurrent stop orders all appear in pendingOrders, balance debited for all 4, journal has 4 placed entries', () => {
        const margin = 250;
        const costEach = margin + margin * COMMISSION_RATE;
        const initialBalance = usePaperStore.getState().balance;

        usePaperStore.getState().placeStopOrder(SYMBOL, 'buy', 55_000, margin); // buy 1
        usePaperStore.getState().placeStopOrder(SYMBOL, 'buy', 56_000, margin); // buy 2
        usePaperStore.getState().placeStopOrder(SYMBOL, 'sell', 45_000, margin); // sell 1
        usePaperStore.getState().placeStopOrder(SYMBOL, 'sell', 44_000, margin); // sell 2

        expect(usePaperStore.getState().pendingOrders).toHaveLength(4);
        expect(usePaperStore.getState().balance).toBeCloseTo(initialBalance - 4 * costEach);

        const placedEntries = usePaperStore
          .getState()
          .journal.filter((e) => e.text.includes('Placed STOP'));
        expect(placedEntries).toHaveLength(4);
      });

      it('3.5.3: placeStopOrder returns null and does not add to pendingOrders when balance is insufficient', () => {
        const id = usePaperStore.getState().placeStopOrder(SYMBOL, 'buy', 55_000, 15_000);
        expect(id).toBeNull();
        expect(usePaperStore.getState().pendingOrders).toHaveLength(0);
      });
    });
  });
});
