/**
 * Pure engine tests — ported from apps/client/src/store/__tests__/paperStore.test.ts (BP-1).
 *
 * The browser store tests run here against the server engine through PaperHarness, which exposes
 * the store's old API. Journal text is unchanged. Differences:
 * - BP-2 fees: Bybit's USDT Perpetual taker 0.055% on notional (qty × price) replaces the flat
 *   0.07% on margin, and opening also reserves Bybit's fee to close (returned at close), priced at
 *   the bankruptcy price entry × (1 ∓ 1/leverage) since BP-3. At 1× leverage notional = margin and
 *   a long's bankruptcy price is 0, so a long open costs margin × (1 + TAKER) and a short
 *   margin × (1 + 3 × TAKER). Fee maths has its own worked-number tests in fees.test.ts.
 * - BP-3 one-way mode: a same-side fill merges into the symbol's one position.
 * - Fills: the browser tests simulated usePendingOrderMonitor step by step (fillPendingOrder →
 *   placeOrder(skipJournal) → addJournalNote); the engine does this in one fillPending action.
 * - A filled pending order is recorded with its own type (limit / stop), as the server already
 *   showed it after a reload, instead of 'market'.
 * - Dropped (no longer applicable): the localStorage persist / migrate tests (the client no
 *   longer persists trading state) and adding a *system* journal note with a PnL badge from
 *   outside the engine (the API only accepts user notes).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OPEN_RULES, PaperHarness, TAKER, flatQuote } from './harness.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * What opening `margin` at 1× costs: margin + open fee + fee to close at the bankruptcy price
 * (0 for a 1× long, 2 × notional for a 1× short), both taker
 */
const openCost = (margin: number, side: 'buy' | 'sell' = 'buy') =>
  margin + margin * TAKER + (side === 'sell' ? 2 * margin * TAKER : 0);
const STARTING_BALANCE = 10_000;
const SYMBOL = 'BTCUSDT';

let store: PaperHarness;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('paperStore', () => {
  beforeEach(() => {
    store = new PaperHarness();
  });

  // ── placeOrder() ───────────────────────────────────────────────────────────

  describe('placeOrder()', () => {
    it('returns a position id string on a valid buy order', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000);
      expect(typeof id).toBe('string');
      expect(id).not.toBeNull();
    });

    it('deducts the USDT amount from balance on a buy', () => {
      store.placeOrder(SYMBOL, 'buy', 50_000, 1_000);
      // balance = 10000 - 1000 (margin) - 0.55 (open fee) - 0 (fee to close: bankruptcy at 0) = 8999.45
      expect(store.balance).toBeCloseTo(8_999.45);
    });

    it('deducts the USDT amount from balance on a sell (margin model)', () => {
      store.placeOrder(SYMBOL, 'sell', 50_000, 500);
      // balance = 10000 - 500 (margin) - 0.275 (open fee) - 0.55 (fee to close at 2 × entry)
      expect(store.balance).toBeCloseTo(9_499.175);
    });

    it('creates a long position for a buy order', () => {
      store.placeOrder(SYMBOL, 'buy', 50_000, 1_000);
      const { positions } = store;
      expect(positions).toHaveLength(1);
      expect(positions[0].side).toBe('long');
    });

    it('creates a short position for a sell order', () => {
      store.placeOrder(SYMBOL, 'sell', 50_000, 1_000);
      const { positions } = store;
      expect(positions).toHaveLength(1);
      expect(positions[0].side).toBe('short');
    });

    it('calculates quantity correctly (usdtAmount / price)', () => {
      store.placeOrder(SYMBOL, 'buy', 50_000, 1_000);
      const pos = store.positions[0];
      expect(pos.quantity).toBeCloseTo(1_000 / 50_000);
    });

    it('returns null when the amount exceeds the balance', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 50_000, 15_000);
      expect(id).toBeNull();
      expect(store.positions).toHaveLength(0);
    });

    it('returns null when the amount is zero', () => {
      expect(store.placeOrder(SYMBOL, 'buy', 50_000, 0)).toBeNull();
    });

    it('returns null when the amount is negative', () => {
      expect(store.placeOrder(SYMBOL, 'buy', 50_000, -100)).toBeNull();
    });

    it('returns null when the price is zero', () => {
      expect(store.placeOrder(SYMBOL, 'buy', 0, 100)).toBeNull();
    });

    it('nets opposite-side positions: buy then equal sell closes the long (0 positions)', () => {
      store.placeOrder(SYMBOL, 'buy', 50_000, 500);
      store.placeOrder(SYMBOL, 'sell', 50_000, 500);
      expect(store.positions).toHaveLength(0);
    });

    it('merges a same-side order into the one position (one-way mode, BP-3)', () => {
      store.placeOrder(SYMBOL, 'buy', 50_000, 500);
      store.placeOrder(SYMBOL, 'buy', 60_000, 300);
      expect(store.positions).toHaveLength(1);
      // 0.01 @ 50,000 + 0.005 @ 60,000 → 0.015 @ 53,333.33…
      expect(store.positions[0].quantity).toBeCloseTo(0.015);
      expect(store.positions[0].entryPrice).toBeCloseTo(53_333.3333, 3);
      expect(store.positions[0].entryUsdtAmount).toBeCloseTo(800);
      expect(store.journal[0].text).toBe('Added to LONG BTCUSDT @ $60000.00 (qty: 0.005000)');
    });
  });

  // ── closePosition() ───────────────────────────────────────────────────────

  describe('closePosition()', () => {
    it('calculates positive PnL for a profitable long (exit > entry)', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 40_000, 4_000)!;
      // qty = 4000/40000 = 0.1 BTC
      // PnL = (50000 - 40000) * 0.1 = 1000
      store.closePosition(id, 50_000);
      const trade = store.history[0];
      expect(trade.pnl).toBeCloseTo(1_000);
    });

    it('calculates negative PnL for a losing long (exit < entry)', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 50_000, 5_000)!;
      // qty = 5000/50000 = 0.1; PnL = (40000 - 50000) * 0.1 = -1000
      store.closePosition(id, 40_000);
      const trade = store.history[0];
      expect(trade.pnl).toBeCloseTo(-1_000);
    });

    it('calculates positive PnL for a profitable short (exit < entry)', () => {
      const id = store.placeOrder(SYMBOL, 'sell', 50_000, 5_000)!;
      // qty = 0.1; PnL = (50000 - 40000) * 0.1 = 1000
      store.closePosition(id, 40_000);
      const trade = store.history[0];
      expect(trade.pnl).toBeCloseTo(1_000);
    });

    it('calculates negative PnL for a losing short (exit > entry)', () => {
      const id = store.placeOrder(SYMBOL, 'sell', 40_000, 4_000)!;
      // qty = 0.1; PnL = (40000 - 50000) * 0.1 = -1000
      store.closePosition(id, 50_000);
      const trade = store.history[0];
      expect(trade.pnl).toBeCloseTo(-1_000);
    });

    it('returns margin + PnL to balance after a profitable long', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 40_000, 4_000)!;
      // Open fee 4000 * 0.00055 = 2.2, close-fee reserve 2.2 → balance after open = 5995.6
      // qty = 4000 / 40000 = 0.1 BTC; gross PnL = (50000 - 40000) * 0.1 = 1000
      // Close fee: 0.1 * 50000 * 0.00055 = 2.75
      // returnAmount = 4000 + 2.2 (reserve back) + 1000 - 2.75 = 4999.45
      // final balance = 5995.6 + 4999.45 = 10995.05
      store.closePosition(id, 50_000);
      expect(store.balance).toBeCloseTo(10_995.05);
    });

    it('floors balance return at 0 — balance never goes negative', () => {
      // Tiny position that loses more than 100% due to short squeeze edge case
      // Manually craft a scenario: buy 1000 at 100, price drops to 0
      const id = store.placeOrder(SYMBOL, 'buy', 100, 1_000)!;
      // qty = 10; PnL = (0 - 100) * 10 = -1000 (wipes entire margin)
      store.closePosition(id, 0);
      // returnAmount = max(0, 1000 + (-1000)) = max(0, 0) = 0
      // balance = 9000 + 0 = 9000 (no negative balance)
      expect(store.balance).toBeGreaterThanOrEqual(0);
    });

    it('removes the closed position from active positions', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
      store.closePosition(id, 50_000);
      expect(store.positions).toHaveLength(0);
    });

    it('adds a ClosedTrade record to history', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
      store.closePosition(id, 55_000);
      expect(store.history).toHaveLength(1);
      expect(store.history[0].id).toBe(id);
    });

    it('records entryPrice, exitPrice and symbol on the closed trade', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
      store.closePosition(id, 55_000);
      const trade = store.history[0];
      expect(trade.entryPrice).toBe(50_000);
      expect(trade.exitPrice).toBe(55_000);
      expect(trade.symbol).toBe(SYMBOL);
    });

    it('caps history at 100 entries (MAX_HISTORY)', () => {
      // Open 101 positions and close them all
      for (let i = 0; i < 101; i++) {
        // Use tiny amounts to avoid running out of balance
        const id = store.placeOrder(SYMBOL, 'buy', 50_000, 10);
        if (id) store.closePosition(id, 50_000);
      }
      expect(store.history.length).toBeLessThanOrEqual(100);
    });

    it('does nothing when the positionId does not exist', () => {
      const balanceBefore = store.balance;
      store.closePosition('non-existent-id', 50_000);
      expect(store.balance).toBe(balanceBefore);
    });

    it('attaches net PnL badge to the exec journal entry on a profitable close', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 40_000, 4_000)!;
      // qty = 0.1; gross PnL = (50000-40000)*0.1 = 1000; close fee = 0.1*50000*0.00055 = 2.75
      store.closePosition(id, 50_000);
      const journal = store.journal;
      const execEntry = journal.find((e) => e.id.includes('-exec'));
      expect(execEntry?.pnl).toBeCloseTo(1_000 - 0.1 * 50_000 * TAKER);
    });

    it('attaches negative net PnL badge to the exec journal entry on a losing close', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 50_000, 5_000)!;
      // qty = 0.1; gross PnL = (40000-50000)*0.1 = -1000; close fee = 0.1*40000*0.00055 = 2.2
      store.closePosition(id, 40_000);
      const journal = store.journal;
      const execEntry = journal.find((e) => e.id.includes('-exec'));
      expect(execEntry?.pnl).toBeCloseTo(-1_000 - 0.1 * 40_000 * TAKER);
    });

    it('addJournalNote pnl is undefined when not provided', () => {
      store.addJournalNote('User note');
      const entry = store.journal[0];
      expect(entry.pnl).toBeUndefined();
    });
  });

  describe('edit journal entries', () => {
    it('writes detailed confirmation entries when editing position TP/SL', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000, 48_000)!;

      store.updatePositionExits(id, 56_000, 47_000);

      const journalTexts = store.journal.slice(0, 3).map((entry) => entry.text);

      expect(journalTexts).toEqual([
        'Stop-Loss modification confirmed — LONG BTCUSDT @ $47000.00',
        'Take-Profit modification confirmed — LONG BTCUSDT @ $56000.00',
        'Modified LONG BTCUSDT exits — TP $55000.00 → $56000.00, SL $48000.00 → $47000.00',
      ]);
    });

    it('writes cancel history and a descriptive journal entry when removing a position TP', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;

      store.updatePositionExits(id, null, null);

      const state = store;
      expect(state.orders[0]).toMatchObject({
        type: 'take-profit',
        status: 'cancelled',
        limitPrice: 55_000,
      });
      expect(state.journal[0].text).toBe('Take-Profit cancelled for LONG BTCUSDT @ $55000.00');
      expect(state.journal[1].text).toBe('Modified LONG BTCUSDT exits — TP removed');
    });

    it('writes detailed parent and child journal entries when editing a pending order', () => {
      const orderId = store.placeLimitOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000, 48_000)!;

      store.editPendingOrder(orderId, 49_000, 1_200, 56_000, 47_000);

      const journalTexts = store.journal.slice(0, 3).map((entry) => entry.text);

      expect(journalTexts).toEqual([
        'Stop-Loss modification confirmed for pending Long BTCUSDT @ $47000.00',
        'Take-Profit modification confirmed for pending Long BTCUSDT @ $56000.00',
        'Modified LIMIT Long BTCUSDT — price $50000.00 → $49000.00, qty 0.020000 → 0.024490, reserved $1000.55 → $1200.66, TP $55000.00 → $56000.00, SL $48000.00 → $47000.00',
      ]);
    });

    it('writes cancel history and a descriptive journal entry when removing a pending TP child', () => {
      const orderId = store.placeLimitOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;

      store.editPendingOrder(orderId, 50_000, 1_000, null, null);

      const state = store;
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
      const orderId = store.placeLimitOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000, 48_000)!;
      const journalCountBefore = store.journal.length;

      store.editPendingOrder(orderId, 50_000, 1_000, 55_000, 48_000);

      expect(store.journal).toHaveLength(journalCountBefore);
    });
  });

  // ── reset() ────────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('restores the starting balance', () => {
      store.placeOrder(SYMBOL, 'buy', 50_000, 2_000);
      store.reset();
      expect(store.balance).toBe(STARTING_BALANCE);
    });

    it('clears all open positions', () => {
      store.placeOrder(SYMBOL, 'buy', 50_000, 1_000);
      store.reset();
      expect(store.positions).toHaveLength(0);
    });

    it('clears trade history', () => {
      const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
      store.closePosition(id, 55_000);
      store.reset();
      expect(store.history).toHaveLength(0);
    });

    it('resets leverage back to 1', () => {
      store.setLeverage(10);
      store.reset();
      expect(store.leverage).toBe(1);
    });
  });

  // ── Section 1 — Market Orders (T1 · Vitest) ───────────────────────────────────

  describe('Section 1 — Market Orders', () => {
    // ── 1.1 Basic Buy: journal + orders array + no pending ──────────────────────

    describe('1.1 Basic Buy', () => {
      it('1.1.5: writes "Opened LONG BTCUSDT @ $50000.00" journal entry on buy', () => {
        store.placeOrder(SYMBOL, 'buy', 50_000, 1_000);
        const journal = store.journal;
        expect(journal[0].text).toBe('Opened LONG BTCUSDT @ $50000.00');
      });

      it('1.1.6: market buy appears in orders[] as type=market, side=buy, status=filled', () => {
        store.placeOrder(SYMBOL, 'buy', 50_000, 1_000);
        const { orders } = store;
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({
          type: 'market',
          side: 'buy',
          status: 'filled',
          fillPrice: 50_000,
        });
      });

      it('1.1.8: pendingOrders is empty after a market buy (market orders are instantly filled)', () => {
        store.placeOrder(SYMBOL, 'buy', 50_000, 1_000);
        expect(store.pendingOrders).toHaveLength(0);
      });
    });

    // ── 1.2 Basic Sell ──────────────────────────────────────────────────────────

    describe('1.2 Basic Sell', () => {
      it('1.2.2: sell order returns a non-null position id', () => {
        const id = store.placeOrder(SYMBOL, 'sell', 50_000, 1_000);
        expect(id).not.toBeNull();
      });

      it('1.2.3: sell order creates a SHORT position', () => {
        store.placeOrder(SYMBOL, 'sell', 50_000, 1_000);
        const pos = store.positions[0];
        expect(pos.side).toBe('short');
      });
    });

    // ── 1.3 Units mode ──────────────────────────────────────────────────────────

    describe('1.3 Units mode', () => {
      it('1.3.4: position qty ≈ 0.001 when USD amount equals 0.001 × price (leverage=1)', () => {
        // USD amount = 0.001 × 50_000 = 50; qty = 50 / 50_000 = 0.001
        store.placeOrder(SYMBOL, 'buy', 50_000, 50);
        expect(store.positions[0].quantity).toBeCloseTo(0.001);
      });
    });

    // ── 1.4 Buy with Take-Profit only ──────────────────────────────────────────

    describe('1.4 Buy with Take-Profit only', () => {
      it('1.4.2: position has takeProfit set; stopLoss is undefined', () => {
        const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;
        const pos = store.positions.find((p) => p.id === id)!;
        expect(pos.takeProfit).toBe(55_000);
        expect(pos.stopLoss).toBeUndefined();
      });

      it('1.4.3: TP trigger removes position and adds profitable history entry', () => {
        const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;
        store.closePosition(
          id,
          55_000,
          'Auto-closed LONG BTCUSDT — Take-Profit hit at $55000.00',
          'take-profit'
        );
        expect(store.positions).toHaveLength(0);
        // qty = 1000 / 50000 = 0.02; gross PnL = (55000 - 50000) × 0.02 = 100
        expect(store.history[0].pnl).toBeCloseTo(100);
      });

      it('1.4.4: auto-close journal entry has TP text and a positive PnL badge', () => {
        const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;
        store.closePosition(
          id,
          55_000,
          'Auto-closed LONG BTCUSDT — Take-Profit hit at $55000.00',
          'take-profit'
        );
        const closeEntry = store.journal.find((e) => e.text.includes('Take-Profit hit'))!;
        expect(closeEntry.text).toBe('Auto-closed LONG BTCUSDT — Take-Profit hit at $55000.00');
        expect(closeEntry.pnl).toBeDefined();
        expect(closeEntry.pnl!).toBeGreaterThan(0);
      });
    });

    // ── 1.5 Sell with Stop-Loss only ────────────────────────────────────────────

    describe('1.5 Sell with Stop-Loss only', () => {
      it('1.5.2: SHORT position has stopLoss set; takeProfit is undefined', () => {
        const id = store.placeOrder(SYMBOL, 'sell', 50_000, 1_000, undefined, 52_000)!;
        const pos = store.positions.find((p) => p.id === id)!;
        expect(pos.side).toBe('short');
        expect(pos.stopLoss).toBe(52_000);
        expect(pos.takeProfit).toBeUndefined();
      });

      it('1.5.3: SL trigger auto-closes SHORT and journal entry has a negative PnL badge', () => {
        // SHORT: SL above entry (52k > 50k) → price rose → loss
        const id = store.placeOrder(SYMBOL, 'sell', 50_000, 1_000, undefined, 52_000)!;
        store.closePosition(
          id,
          52_000,
          'Auto-closed SHORT BTCUSDT — Stop-Loss hit at $52000.00',
          'stop-loss'
        );
        expect(store.positions).toHaveLength(0);
        const closeEntry = store.journal.find((e) => e.text.includes('Stop-Loss hit'))!;
        expect(closeEntry.pnl).toBeDefined();
        expect(closeEntry.pnl!).toBeLessThan(0);
      });
    });

    // ── 1.6 Buy with both TP and SL ─────────────────────────────────────────────

    describe('1.6 Buy with both TP and SL', () => {
      it('1.6.2: LONG position has both takeProfit and stopLoss set', () => {
        const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000, 48_000)!;
        const pos = store.positions.find((p) => p.id === id)!;
        expect(pos.takeProfit).toBe(55_000);
        expect(pos.stopLoss).toBe(48_000);
      });

      it('1.6.3: manual close cancels both TP and SL — two sibling Cancelled orders added', () => {
        const id = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000, 48_000)!;
        store.closePosition(id, 50_500); // no closeType → manual
        const cancelledOrders = store.orders.filter((o) => o.status === 'cancelled');
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
        const balanceBefore = store.balance;
        const id = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000);
        expect(id).not.toBeNull();
        const { pendingOrders, balance } = store;
        expect(pendingOrders).toHaveLength(1);
        expect(pendingOrders[0]).toMatchObject({
          symbol: SYMBOL,
          side: 'buy',
          type: 'limit',
          triggerPrice: 48_000,
          usdtAmount: 1_000,
        });
        // Balance decreases by margin + estimated open and close fees (the reserve)
        expect(balance).toBeCloseTo(balanceBefore - openCost(1_000));
      });

      it('2.1.5: filling a limit order creates a position and writes a fill journal entry', () => {
        const orderId = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000)!;
        const posId = store.fillPending(orderId, 48_000);

        expect(posId).not.toBeNull();
        expect(store.positions).toHaveLength(1);
        expect(store.pendingOrders).toHaveLength(0);
        expect(store.journal[0].text).toBe(
          'Limit order filled — Long BTCUSDT @ $48000.00 (trigger: $48000.00, qty: 0.020833)'
        );
      });
    });

    // ── 2.2 Limit Buy cancel ────────────────────────────────────────────────────

    describe('2.2 Limit Buy cancel', () => {
      it('2.2.1: placeLimitOrder adds to pendingOrders and immediately writes a Placed journal entry', () => {
        store.placeLimitOrder(SYMBOL, 'buy', 45_000, 500);
        const { pendingOrders, journal } = store;
        expect(pendingOrders).toHaveLength(1);
        expect(journal[0].text).toContain('Placed LIMIT Long BTCUSDT @ $45000.00');
      });

      it('2.2.2: cancelPendingOrder fully refunds balance, moves order to Cancelled, and writes journal', () => {
        const balanceBefore = store.balance;
        const orderId = store.placeLimitOrder(SYMBOL, 'buy', 45_000, 500)!;
        store.cancelPendingOrder(orderId);

        expect(store.pendingOrders).toHaveLength(0);
        expect(store.balance).toBeCloseTo(balanceBefore);

        const cancelledOrder = store.orders.find(
          (o) => o.status === 'cancelled' && o.type === 'limit'
        );
        expect(cancelledOrder).toBeDefined();

        expect(store.journal.some((e) => e.text.includes('Cancelled LIMIT Long'))).toBe(true);
      });
    });

    // ── 2.3 Limit Sell above market ─────────────────────────────────────────────

    describe('2.3 Limit Sell above market', () => {
      it('2.3.1: sell limit order creates a pending order with side=sell', () => {
        store.placeLimitOrder(SYMBOL, 'sell', 52_000, 1_000);
        const order = store.pendingOrders[0];
        expect(order.side).toBe('sell');
        expect(order.triggerPrice).toBe(52_000);
      });

      it('2.3.2: filling a sell limit order opens a SHORT position', () => {
        const orderId = store.placeLimitOrder(SYMBOL, 'sell', 52_000, 1_000)!;
        store.fillPending(orderId, 52_000);
        const positions = store.positions;
        expect(positions).toHaveLength(1);
        expect(positions[0].side).toBe('short');
      });
    });

    // ── 2.4 Limit with TP + SL — Pre-fill ──────────────────────────────────────

    describe('2.4 Limit with TP + SL — Pre-fill', () => {
      it('2.4.1: bracket limit buy stores TP + SL on the pending order and writes placement journal', () => {
        store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000);
        const order = store.pendingOrders[0];
        expect(order.takeProfit).toBe(53_000);
        expect(order.stopLoss).toBe(46_000);
        // Journal written immediately at placement (before fill)
        expect(
          store.journal.some((e) => e.text.includes('Placed LIMIT Long BTCUSDT @ $48000.00'))
        ).toBe(true);
      });

      it('2.4.2: cancelPendingExitLeg(stop-loss) removes SL from order; adds Cancelled row; balance unchanged', () => {
        const orderId = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;
        const balanceAfterPlacement = store.balance;

        store.cancelPendingExitLeg(orderId, 'stop-loss');

        const order = store.pendingOrders[0];
        expect(order.stopLoss).toBeUndefined();
        expect(order.takeProfit).toBe(53_000); // TP unaffected

        const cancelledSl = store.orders.find(
          (o) => o.type === 'stop-loss' && o.status === 'cancelled'
        );
        expect(cancelledSl).toBeDefined();

        expect(store.journal.some((e) => e.text.includes('Stop-Loss cancelled for pending'))).toBe(
          true
        );

        // Balance unchanged — no refund for child legs
        expect(store.balance).toBeCloseTo(balanceAfterPlacement);
      });

      it('2.4.3: cancelPendingExitLeg(take-profit) removes TP from order; adds Cancelled row; balance unchanged', () => {
        const orderId = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;
        const balanceAfterPlacement = store.balance;

        store.cancelPendingExitLeg(orderId, 'take-profit');

        const order = store.pendingOrders[0];
        expect(order.takeProfit).toBeUndefined();
        expect(order.stopLoss).toBe(46_000); // SL unaffected

        const cancelledTp = store.orders.find(
          (o) => o.type === 'take-profit' && o.status === 'cancelled'
        );
        expect(cancelledTp).toBeDefined();

        expect(
          store.journal.some((e) => e.text.includes('Take-Profit cancelled for pending'))
        ).toBe(true);

        expect(store.balance).toBeCloseTo(balanceAfterPlacement);
      });

      it('2.4.4: cancelPendingOrder (bracket) produces 3 Cancelled rows and fully refunds balance', () => {
        const balanceBefore = store.balance;
        const orderId = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;

        store.cancelPendingOrder(orderId);

        expect(store.pendingOrders).toHaveLength(0);
        expect(store.balance).toBeCloseTo(balanceBefore);

        const cancelledOrders = store.orders.filter((o) => o.status === 'cancelled');
        expect(cancelledOrders).toHaveLength(3);
        const types = cancelledOrders.map((o) => o.type).sort();
        expect(types).toEqual(['limit', 'stop-loss', 'take-profit']);

        expect(store.journal.some((e) => e.text.includes('Cancelled LIMIT Long'))).toBe(true);
      });
    });

    // ── 2.4 Limit with TP + SL — Post-fill ─────────────────────────────────────

    describe('2.4 Limit with TP + SL — Post-fill', () => {
      /** Helper: place + fill a bracket limit Buy with given TP and SL prices. */
      function fillBracket(tp: number, sl: number): string {
        const orderId = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, tp, sl)!;
        return store.fillPending(orderId, 48_000)!;
      }

      it('2.4.5: limit fill → position has TP + SL; pendingOrders empty; journal has 3 activation entries', () => {
        const orderId = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;
        const posId = store.fillPending(orderId, 48_000)!;

        expect(store.pendingOrders).toHaveLength(0);
        const pos = store.positions.find((p) => p.id === posId)!;
        expect(pos.takeProfit).toBe(53_000);
        expect(pos.stopLoss).toBe(46_000);

        // Newest first: each note was prepended in turn (usePendingOrderMonitor order)
        expect(store.journal.slice(0, 3).map((e) => e.text)).toEqual([
          'Stop-Loss order activated — Long BTCUSDT @ $46000.00',
          'Take-Profit order activated — Long BTCUSDT @ $53000.00',
          'Limit order filled — Long BTCUSDT @ $48000.00 (trigger: $48000.00, qty: 0.020833)',
        ]);
      });

      it('2.4.6: cancelExitOrder(take-profit) cancels TP; adds Cancelled row; position retains SL', () => {
        const posId = fillBracket(53_000, 46_000);
        store.cancelExitOrder(posId, 'take-profit');

        const pos = store.positions.find((p) => p.id === posId)!;
        expect(pos.takeProfit).toBeUndefined();
        expect(pos.stopLoss).toBe(46_000);

        const cancelledTp = store.orders.find(
          (o) => o.type === 'take-profit' && o.status === 'cancelled'
        );
        expect(cancelledTp).toBeDefined();

        expect(store.journal.some((e) => e.text.includes('Take-Profit cancelled for LONG'))).toBe(
          true
        );
      });

      it('2.4.7: cancelExitOrder(stop-loss) cancels SL; adds Cancelled row; position retains TP', () => {
        const posId = fillBracket(53_000, 46_000);
        store.cancelExitOrder(posId, 'stop-loss');

        const pos = store.positions.find((p) => p.id === posId)!;
        expect(pos.stopLoss).toBeUndefined();
        expect(pos.takeProfit).toBe(53_000);

        const cancelledSl = store.orders.find(
          (o) => o.type === 'stop-loss' && o.status === 'cancelled'
        );
        expect(cancelledSl).toBeDefined();

        expect(store.journal.some((e) => e.text.includes('Stop-Loss cancelled for LONG'))).toBe(
          true
        );
      });

      it('2.4.8: after the fill, parent limit order is no longer in pendingOrders', () => {
        const orderId = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;
        store.fillPending(orderId, 48_000);
        expect(store.pendingOrders).toHaveLength(0);
      });

      it('2.4.9: TP triggers (closeType=take-profit) → sibling SL Cancelled + position closed', () => {
        const posId = fillBracket(53_000, 46_000);
        store.closePosition(
          posId,
          53_000,
          'Auto-closed LONG BTCUSDT — Take-Profit hit at $53000.00',
          'take-profit'
        );
        expect(store.positions).toHaveLength(0);
        const siblingCancel = store.orders.find(
          (o) => o.type === 'stop-loss' && o.status === 'cancelled'
        );
        expect(siblingCancel).toBeDefined();
        expect(siblingCancel!.commission).toBe(0);
      });

      it('2.4.10: SL triggers (closeType=stop-loss) → sibling TP Cancelled + position closed', () => {
        const posId = fillBracket(53_000, 46_000);
        store.closePosition(
          posId,
          46_000,
          'Auto-closed LONG BTCUSDT — Stop-Loss hit at $46000.00',
          'stop-loss'
        );
        expect(store.positions).toHaveLength(0);
        const siblingCancel = store.orders.find(
          (o) => o.type === 'take-profit' && o.status === 'cancelled'
        );
        expect(siblingCancel).toBeDefined();
        expect(siblingCancel!.commission).toBe(0);
      });

      it('2.4.11: manual close with both TP + SL active → 2 sibling Cancelled rows (commission = 0 each)', () => {
        const posId = fillBracket(53_000, 46_000);
        store.closePosition(posId, 50_000); // no closeType → manual
        const cancelledOrders = store.orders.filter((o) => o.status === 'cancelled');
        expect(cancelledOrders).toHaveLength(2);
        const types = cancelledOrders.map((o) => o.type).sort();
        expect(types).toEqual(['stop-loss', 'take-profit']);
        cancelledOrders.forEach((o) => expect(o.commission).toBe(0));
      });
    });

    // ── 2.5 Edge cases ──────────────────────────────────────────────────────────

    describe('2.5 Edge cases', () => {
      it('2.5.3: pending orders remain symbol-scoped when a second order is placed for a different symbol', () => {
        store.placeLimitOrder(SYMBOL, 'buy', 48_000, 500);
        store.placeLimitOrder('ETHUSDT', 'buy', 3_000, 200);

        const btcOrder = store.pendingOrders.find((o) => o.symbol === SYMBOL);
        const ethOrder = store.pendingOrders.find((o) => o.symbol === 'ETHUSDT');
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
    // ── 4.7 History PnL signs ────────────────────────────────────────────────

    describe('4.7 History PnL signs after mix of wins and losses', () => {
      it('4.7: profitable close → positive PnL in history', () => {
        const posId = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        // Close above entry for a Long = profit
        store.closePosition(posId, 55_000, 'Closed LONG BTCUSDT @ $55000');

        const trade = store.history[0];
        expect(trade).toBeDefined();
        const grossPnl = (55_000 - trade.entryPrice) * trade.quantity;
        expect(grossPnl).toBeGreaterThan(0);
      });

      it('4.7: losing close → negative PnL in history', () => {
        const posId = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        // Close below entry for a Long = loss
        store.closePosition(posId, 45_000, 'Closed LONG BTCUSDT @ $45000');

        const trade = store.history[0];
        expect(trade).toBeDefined();
        const grossPnl = (45_000 - trade.entryPrice) * trade.quantity;
        expect(grossPnl).toBeLessThan(0);
      });

      it('4.7: multiple closes accumulate in history in correct order; PnL signs are independent', () => {
        const pos1 = store.placeOrder(SYMBOL, 'buy', 50_000, 500)!;
        store.closePosition(pos1, 55_000); // profit
        const pos2 = store.placeOrder(SYMBOL, 'sell', 50_000, 500)!;
        store.closePosition(pos2, 45_000); // SHORT profit (price dropped)

        expect(store.history).toHaveLength(2);
      });
    });

    // ── 4.8 Journal entries newest-first ────────────────────────────────────

    describe('4.8 Journal entries are newest-first and cover full lifecycle', () => {
      it('4.8: journal entries are stored newest-first (journal[0].time >= journal[N-1].time)', () => {
        // Place, then close — generates at least 2 journal entries
        const posId = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        store.closePosition(posId, 55_000, 'Closed LONG BTCUSDT @ $55000');

        const journal = store.journal;
        expect(journal.length).toBeGreaterThanOrEqual(2);
        // Each entry must have a time >= the next entry (newest at index 0)
        for (let i = 0; i < journal.length - 1; i++) {
          // i is a bounded loop index — safe, controlled access
          // eslint-disable-next-line security/detect-object-injection
          expect(journal[i].time).toBeGreaterThanOrEqual(journal[i + 1].time);
        }
      });

      it('4.8: journal covers lifecycle — open entry + close entry for a market order trade', () => {
        const posId = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        store.closePosition(posId, 55_000, 'Closed LONG BTCUSDT @ $55000.00');

        const journal = store.journal;
        const openEntry = journal.find((e) => e.text.includes('Opened LONG'));
        const closeEntry = journal.find((e) => e.text.includes('Closed LONG'));
        expect(openEntry).toBeDefined();
        expect(closeEntry).toBeDefined();
      });

      it('4.8: system auto-entries are read-only (isUserNote=false); manual notes are editable (isUserNote=true)', () => {
        store.placeOrder(SYMBOL, 'buy', 50_000, 1_000);
        store.addJournalNote('My manual note');

        const journal = store.journal;
        const systemEntry = journal.find((e) => e.text.includes('Opened LONG'));
        const userEntry = journal.find((e) => e.text === 'My manual note');

        expect(systemEntry!.isUserNote).toBe(false);
        expect(userEntry!.isUserNote).toBe(true);
      });

      it('4.8: common store-generated journal entries explicitly set isUserNote=false', () => {
        const posId = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        store.closePosition(posId, 51_000);

        const limitId = store.placeLimitOrder(SYMBOL, 'buy', 45_000, 500)!;
        store.cancelPendingOrder(limitId);

        const journal = store.journal;
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
        const posId = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        const pos = store.positions.find((p) => p.id === posId)!;
        // Close at 55 000 — Long position from 50 000 → profit
        store.closePosition(posId, 55_000, 'Closed LONG BTCUSDT @ $55000.00');

        const closeEntry = store.journal.find((e) => e.text.includes('Closed LONG'));
        expect(closeEntry).toBeDefined();
        expect(closeEntry!.pnl).toBeDefined();
        // Net PnL = gross_pnl - exit_commission; gross > 0 when exit > entry
        const grossPnl = (55_000 - pos.entryPrice) * pos.quantity;
        expect(grossPnl).toBeGreaterThan(0);
        // After commission, it should still be positive (5 000-point move >> 0.07% fee)
        expect(closeEntry!.pnl!).toBeGreaterThan(0);
      });

      it('4.9: no PnL badge on the open/placement journal entry (only close entries carry it)', () => {
        store.placeOrder(SYMBOL, 'buy', 50_000, 1_000);

        const openEntry = store.journal.find((e) => e.text.includes('Opened LONG'));
        expect(openEntry).toBeDefined();
        expect(openEntry!.pnl).toBeUndefined();
      });
    });

    // ── 4.10 Journal PnL badge — losing close ────────────────────────────────

    describe('4.10 Journal PnL badge — losing close', () => {
      it('4.10: losing close attaches a negative pnl to the exec journal entry', () => {
        const posId = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000)!;
        store.closePosition(posId, 45_000, 'Closed LONG BTCUSDT @ $45000.00');

        const closeEntry = store.journal.find((e) => e.text.includes('Closed LONG'));
        expect(closeEntry).toBeDefined();
        expect(closeEntry!.pnl).toBeDefined();
        expect(closeEntry!.pnl!).toBeLessThan(0);
      });

      it('4.10: TP auto-close → journal entry pnl badge present', () => {
        const posId = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000, 55_000)!;
        store.closePosition(
          posId,
          55_000,
          'Auto-closed LONG BTCUSDT — Take-Profit hit at $55000.00',
          'take-profit'
        );

        const tpEntry = store.journal.find((e) => e.text.includes('Take-Profit hit'));
        expect(tpEntry).toBeDefined();
        expect(tpEntry!.pnl).toBeDefined();
      });
    });

    // ── 4.11 Journal PnL badge — user note ──────────────────────────────────

    describe('4.11 Journal PnL badge — user note has no badge', () => {
      it('4.11: addJournalNote with isUserNote=true results in pnl=undefined', () => {
        store.addJournalNote('Observation note');

        const entry = store.journal[0];
        expect(entry.isUserNote).toBe(true);
        expect(entry.pnl).toBeUndefined();
      });

      it('4.11: addJournalNote pnl is undefined when not provided', () => {
        store.addJournalNote('Test note');

        const entry = store.journal[0];
        expect(entry.pnl).toBeUndefined();
      });
    });

    // ── 4.17 Edit pending bracket order — rich journal entries ───────────────

    describe('4.17 Edit pending bracket order — rich journal entries', () => {
      it('4.17: editing pending order price + exits writes summary + child-leg confirmation journal entries', () => {
        const orderId = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;

        store.editPendingOrder(orderId, 48_500, 1_000, 54_000, 45_500);

        const journal = store.journal;
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
        const orderId = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;

        // Remove TP by passing null, keep SL
        store.editPendingOrder(orderId, 48_000, 1_000, null, 46_000);

        const journal = store.journal;
        expect(
          journal.some((e) => e.text.includes('Take-Profit') && e.text.includes('cancelled'))
        ).toBe(true);

        const cancelledTp = store.orders.find(
          (o) => o.type === 'take-profit' && o.status === 'cancelled'
        );
        expect(cancelledTp).toBeDefined();
      });

      it('4.17: no-op edit (same price, same exits) does not add additional journal noise', () => {
        const orderId = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000, 53_000, 46_000)!;
        const journalSizeBefore = store.journal.length;

        // Edit with identical values → no-op
        store.editPendingOrder(orderId, 48_000, 1_000, 53_000, 46_000);

        expect(store.journal.length).toBe(journalSizeBefore);
      });
    });

    // ── 4.18 Edit open position TP/SL — rich journal entries ─────────────────

    describe('4.18 Edit open position TP/SL — rich journal entries', () => {
      it('4.18: editing both TP and SL on an open position writes summary + modification-confirmed child entries', () => {
        const posId = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000, 53_000, 47_000)!;

        store.updatePositionExits(posId, 54_000, 46_000);

        const journal = store.journal;
        expect(journal.some((e) => e.text.includes('Modified LONG BTCUSDT exits'))).toBe(true);
        expect(journal.some((e) => e.text.includes('Take-Profit modification confirmed'))).toBe(
          true
        );
        expect(journal.some((e) => e.text.includes('Stop-Loss modification confirmed'))).toBe(true);
      });

      it('4.18: removing TP from an open position writes a cancel-style journal entry and Cancelled HistoricalOrder', () => {
        const posId = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000, 53_000, 47_000)!;

        // Remove TP, keep SL
        store.updatePositionExits(posId, null, 47_000);

        const journal = store.journal;
        expect(
          journal.some((e) => e.text.includes('Take-Profit') && e.text.includes('cancelled'))
        ).toBe(true);

        const cancelledTp = store.orders.find(
          (o) => o.type === 'take-profit' && o.status === 'cancelled'
        );
        expect(cancelledTp).toBeDefined();
      });

      it('4.18: position TP/SL values are updated in-place after updatePositionExits', () => {
        const posId = store.placeOrder(SYMBOL, 'buy', 50_000, 1_000, 53_000, 47_000)!;

        store.updatePositionExits(posId, 55_000, 46_000);

        const pos = store.positions.find((p) => p.id === posId)!;
        expect(pos.takeProfit).toBe(55_000);
        expect(pos.stopLoss).toBe(46_000);
      });
    });
  });

  // ── Section 3 — Stop Orders (T1 · Vitest) ─────────────────────────────────────

  describe('Section 3 — Stop Orders', () => {
    /** A stop order triggers and fills at `fillPrice` (the engine's fillPending). */
    function fillStop(orderId: string, fillPrice: number): string | null {
      return store.fillPending(orderId, fillPrice);
    }

    // ── 3.1 Stop Buy placement and fill ────────────────────────────────────────

    describe('3.1 Stop Buy placement and fill', () => {
      it('3.1.1: placeStopOrder creates pending stop buy with correct type/side/triggerPrice and reserves balance', () => {
        const balanceBefore = store.balance;
        const id = store.placeStopOrder(SYMBOL, 'buy', 55_000, 1_000);

        expect(id).not.toBeNull();

        const { pendingOrders, balance } = store;
        expect(pendingOrders).toHaveLength(1);
        expect(pendingOrders[0]).toMatchObject({
          symbol: SYMBOL,
          side: 'buy',
          type: 'stop',
          triggerPrice: 55_000,
          usdtAmount: 1_000,
        });
        // Balance reduced by margin + estimated fees (reserved upfront)
        expect(balance).toBeCloseTo(balanceBefore - openCost(1_000));
      });

      it('3.1.2: stop buy fill opens a Long position, clears pendingOrders, journal has fill entry', () => {
        const orderId = store.placeStopOrder(SYMBOL, 'buy', 55_000, 1_000)!;
        fillStop(orderId, 55_000);

        const { positions, pendingOrders } = store;
        expect(positions).toHaveLength(1);
        expect(positions[0].side).toBe('long');
        expect(pendingOrders).toHaveLength(0);
        expect(store.journal.some((e) => e.text.includes('Stop order filled — Long'))).toBe(true);
      });

      // Changed in BP-1: the fill record keeps the order's own type ('stop'), as the server
      // already showed it after a reload; the browser briefly recorded it as 'market'.
      it('3.1.3: Order History after stop fill has status=filled, type=stop, side=buy, fillPrice and commission > 0', () => {
        const orderId = store.placeStopOrder(SYMBOL, 'buy', 55_000, 1_000)!;
        fillStop(orderId, 55_000);

        const filledOrders = store.orders.filter(
          (o) => o.status === 'filled' && o.type === 'stop' && o.side === 'buy'
        );
        expect(filledOrders).toHaveLength(1);
        expect(filledOrders[0].fillPrice).toBe(55_000);
        expect(filledOrders[0].commission).toBeGreaterThan(0);
      });

      it('3.1.2 slippage: fill at price above trigger still creates the position at fill price', () => {
        // When price races through the stop, the fill price > triggerPrice (slippage)
        const orderId = store.placeStopOrder(SYMBOL, 'buy', 55_000, 1_000)!;
        const fillPrice = 55_100; // slightly above trigger
        fillStop(orderId, fillPrice);

        const pos = store.positions[0];
        expect(pos.entryPrice).toBe(fillPrice);
      });
    });

    // ── 3.2 Stop Sell placement and fill ───────────────────────────────────────

    describe('3.2 Stop Sell placement and fill', () => {
      it('3.2.1: placeStopOrder sell creates pending stop sell with side=sell, type=stop, triggerPrice correct', () => {
        store.placeStopOrder(SYMBOL, 'sell', 45_000, 1_000);

        const order = store.pendingOrders[0];
        expect(order.side).toBe('sell');
        expect(order.type).toBe('stop');
        expect(order.triggerPrice).toBe(45_000);
      });

      it('3.2.2: stop sell fill opens a Short position and journal has "Stop order filled — Short" entry', () => {
        const orderId = store.placeStopOrder(SYMBOL, 'sell', 45_000, 1_000)!;
        fillStop(orderId, 45_000);

        const { positions } = store;
        expect(positions).toHaveLength(1);
        expect(positions[0].side).toBe('short');
        expect(store.journal.some((e) => e.text.includes('Stop order filled — Short'))).toBe(true);
      });

      it('3.2.2 slippage: fill at price below trigger still creates the position at fill price', () => {
        const orderId = store.placeStopOrder(SYMBOL, 'sell', 45_000, 1_000)!;
        const fillPrice = 44_950; // slightly below trigger
        fillStop(orderId, fillPrice);

        const pos = store.positions[0];
        expect(pos.entryPrice).toBe(fillPrice);
      });
    });

    // ── 3.3 Cancel stop order ──────────────────────────────────────────────────

    describe('3.3 Cancel stop order', () => {
      it('3.3.1: cancelPendingOrder fully refunds reserved balance, removes from pendingOrders, writes journal', () => {
        const balanceBefore = store.balance;
        const orderId = store.placeStopOrder(SYMBOL, 'sell', 45_000, 1_000)!;

        store.cancelPendingOrder(orderId);

        expect(store.pendingOrders).toHaveLength(0);
        // Balance fully restored (margin + entry commission refunded)
        expect(store.balance).toBeCloseTo(balanceBefore);
        expect(store.journal.some((e) => e.text.includes('Cancelled STOP'))).toBe(true);
      });

      it('3.3.2: cancelled stop in orders[] has status=cancelled, type=stop, stopPrice preserved, timestamps set', () => {
        const orderId = store.placeStopOrder(SYMBOL, 'sell', 45_000, 1_000)!;
        store.cancelPendingOrder(orderId);

        const cancelledOrder = store.orders.find(
          (o) => o.status === 'cancelled' && o.type === 'stop'
        );
        expect(cancelledOrder).toBeDefined();
        expect(cancelledOrder!.stopPrice).toBe(45_000);
        expect(cancelledOrder!.placingTime).toBeGreaterThan(0);
        expect(cancelledOrder!.closingTime).toBeGreaterThanOrEqual(cancelledOrder!.placingTime);
      });
    });

    // ── 3.4 Stop with TP + SL bracket ─────────────────────────────────────────

    describe('3.4 Stop buy with TP + SL bracket', () => {
      it('3.4.1: placeStopOrder with TP=78k SL=76k stores both exits on the pending order', () => {
        store.placeStopOrder(SYMBOL, 'buy', 77_350, 1_000, 78_000, 76_000);

        const order = store.pendingOrders[0];
        expect(order.takeProfit).toBe(78_000);
        expect(order.stopLoss).toBe(76_000);
      });

      it('3.4.2: stop fill with TP+SL → position has takeProfit+stopLoss and pendingOrders is empty', () => {
        const orderId = store.placeStopOrder(SYMBOL, 'buy', 77_350, 1_000, 78_000, 76_000)!;
        const posId = fillStop(orderId, 77_350);

        expect(store.pendingOrders).toHaveLength(0);
        const pos = store.positions.find((p) => p.id === posId)!;
        expect(pos.takeProfit).toBe(78_000);
        expect(pos.stopLoss).toBe(76_000);
      });

      it('3.4.2: stop fill with TP+SL writes Take-Profit and Stop-Loss activation journal entries', () => {
        const orderId = store.placeStopOrder(SYMBOL, 'buy', 77_350, 1_000, 78_000, 76_000)!;
        fillStop(orderId, 77_350);

        const journal = store.journal;
        expect(journal.some((e) => e.text.includes('Take-Profit order activated'))).toBe(true);
        expect(journal.some((e) => e.text.includes('Stop-Loss order activated'))).toBe(true);
      });

      it('3.4.2: cancel bracket stop order creates 3 Cancelled rows (STOP + TP child + SL child) and fully refunds balance', () => {
        const balanceBefore = store.balance;
        const orderId = store.placeStopOrder(SYMBOL, 'buy', 77_350, 1_000, 78_000, 76_000)!;

        store.cancelPendingOrder(orderId);

        expect(store.pendingOrders).toHaveLength(0);
        expect(store.balance).toBeCloseTo(balanceBefore);

        const cancelledOrders = store.orders.filter((o) => o.status === 'cancelled');
        expect(cancelledOrders).toHaveLength(3);
        const types = cancelledOrders.map((o) => o.type).sort();
        expect(types).toEqual(['stop', 'stop-loss', 'take-profit']);
      });
    });

    // ── 3.5 Multiple concurrent stop orders ───────────────────────────────────

    describe('3.5 Multiple stop orders coexist', () => {
      it('3.5.3: 4 concurrent stop orders all appear in pendingOrders, balance debited for all 4, journal has 4 placed entries', () => {
        const margin = 250;
        const initialBalance = store.balance;

        store.placeStopOrder(SYMBOL, 'buy', 55_000, margin); // buy 1
        store.placeStopOrder(SYMBOL, 'buy', 56_000, margin); // buy 2
        store.placeStopOrder(SYMBOL, 'sell', 45_000, margin); // sell 1
        store.placeStopOrder(SYMBOL, 'sell', 44_000, margin); // sell 2

        expect(store.pendingOrders).toHaveLength(4);
        expect(store.balance).toBeCloseTo(
          initialBalance - 2 * openCost(margin, 'buy') - 2 * openCost(margin, 'sell')
        );

        const placedEntries = store.journal.filter((e) => e.text.includes('Placed STOP'));
        expect(placedEntries).toHaveLength(4);
      });

      it('3.5.3: placeStopOrder returns null and does not add to pendingOrders when balance is insufficient', () => {
        const id = store.placeStopOrder(SYMBOL, 'buy', 55_000, 15_000);
        expect(id).toBeNull();
        expect(store.pendingOrders).toHaveLength(0);
      });
    });
  });
});

// ─── BP-1 safety fixes and netting ─────────────────────────────────────────────

describe('BP-1 safety fixes', () => {
  beforeEach(() => {
    store = new PaperHarness();
  });

  it('S2: a pending order fills with the leverage it was placed with, not the current one', () => {
    store.setLeverage(1);
    const orderId = store.placeLimitOrder(SYMBOL, 'buy', 50_000, 1_000)!;
    store.setLeverage(10);
    store.fillPending(orderId, 50_000);
    // qty = 1000 × 1 / 50000 = 0.02 (the browser would have used 10× → 0.2)
    expect(store.positions[0].quantity).toBeCloseTo(0.02);
  });

  it('S2 + BP-2: an edit keeps the order leverage; a default change leaves a symbol with an order pinned', () => {
    const orderId = store.placeLimitOrder(SYMBOL, 'buy', 50_000, 1_000)!;
    // BP-2: leverage is per symbol and locked while the symbol has an order — changing the
    // default pins BTCUSDT at its 1×, so the edit (and the fill) stay at 1×
    store.setLeverage(5);
    expect(store.raw.symbolLeverage).toEqual({ [SYMBOL]: 1 });
    store.editPendingOrder(orderId, 50_000, 1_000, null, null);
    expect(store.pendingOrders[0]).toMatchObject({ leverage: 1, qty: 0.02 });
    store.fillPending(orderId, 50_000);
    expect(store.positions[0].quantity).toBeCloseTo(0.02);
  });

  it('S1: a triggered order that cannot fill is recorded as rejected, never dropped', () => {
    const balanceBefore = store.balance;
    const orderId = store.placeLimitOrder(SYMBOL, 'buy', 50_000, 1_000)!;
    const posId = store.fillPending(orderId, 0); // invalid fill price → cannot fill

    expect(posId).toBeNull();
    expect(store.pendingOrders).toHaveLength(0);
    expect(store.positions).toHaveLength(0);
    expect(store.orders[0]).toMatchObject({
      id: `o-${orderId}`,
      type: 'limit',
      status: 'rejected',
      rejectionReason: 'Order could not be filled.',
    });
    // The reserve is released back to the balance
    expect(store.balance).toBeCloseTo(balanceBefore);
    expect(store.journal[0].text).toBe(
      'Limit order for BTCUSDT triggered @ $0.000000 but could not be filled'
    );
  });

  it('fill record: a filled limit order keeps its id and type in order history', () => {
    const orderId = store.placeLimitOrder(SYMBOL, 'buy', 48_000, 1_000)!;
    store.fillPending(orderId, 47_990);
    expect(store.orders[0]).toMatchObject({
      id: `o-${orderId}`,
      type: 'limit',
      status: 'filled',
      limitPrice: 48_000,
      fillPrice: 47_990,
    });
    expect(store.lastSound).toBe('filled');
  });
});

describe('netting (one-way positions)', () => {
  beforeEach(() => {
    store = new PaperHarness();
  });

  it('an opposite order larger than the position closes it and opens the remainder (flip)', () => {
    store.placeOrder(SYMBOL, 'buy', 50_000, 1_000); // long 0.02
    store.placeOrder(SYMBOL, 'sell', 50_000, 1_500); // sell 0.03 → close 0.02, short 0.01
    const [pos] = store.positions;
    expect(store.positions).toHaveLength(1);
    expect(pos.side).toBe('short');
    expect(pos.quantity).toBeCloseTo(0.01);
    expect(pos.entryUsdtAmount).toBeCloseTo(500);
    // One order record for the user action (the incoming sell), plus the original buy
    expect(store.orders.filter((o) => o.side === 'sell')).toHaveLength(1);
    expect(store.orders[0].qty).toBeCloseTo(0.03);
  });

  it('a smaller opposite order partially closes the position and returns proportional margin', () => {
    store.placeOrder(SYMBOL, 'buy', 50_000, 1_000); // long 0.02, margin 1000
    const balanceAfterOpen = store.balance;
    store.placeOrder(SYMBOL, 'sell', 55_000, 550); // sell 0.01 at 55k → close half
    expect(store.positions[0].quantity).toBeCloseTo(0.01);
    expect(store.positions[0].entryUsdtAmount).toBeCloseTo(500);
    // return = 500 margin + 0 (a 1× long reserves no fee to close) + 50 pnl − 0.3025 close fee
    expect(store.balance).toBeCloseTo(balanceAfterOpen + 500 + 50 - 0.01 * 55_000 * TAKER);
    expect(store.history[0]).toMatchObject({ quantity: 0.01, pnl: 50 });
  });

  it('realizedPnl subtracts both commission legs on a close', () => {
    const id = store.placeOrder(SYMBOL, 'buy', 40_000, 4_000)!;
    store.closePosition(id, 50_000);
    // gross 1000 − close fee 2.75 − open fee 2.2
    expect(store.realizedPnl).toBeCloseTo(1_000 - 2.75 - 2.2);
  });

  it('a market order that would exceed the balance is recorded as rejected', () => {
    expect(store.placeOrder(SYMBOL, 'buy', 50_000, 20_000)).toBeNull();
    expect(store.orders[0]).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Not enough funds to complete the order.',
    });
  });
});

describe('leverage is re-clamped where a fill is sized (defense in depth)', () => {
  it('an out-of-range stored leverage sizes the position at MAX_LEVERAGE (10)', async () => {
    const { Decimal } = await import('@prisma/client/runtime/client');
    const { placeMarket } = await import('../index.js');
    const res = placeMarket(
      {
        balance: new Decimal(10_000),
        realizedPnl: new Decimal(0),
        leverage: 50, // e.g. a bad manual DB edit
        symbolLeverage: {},
        spot: [],
        positions: [],
        pendingOrders: [],
      },
      { symbol: SYMBOL, side: 'buy', size: { margin: new Decimal(1_000) } },
      flatQuote(50_000),
      OPEN_RULES,
      { now: 1, newId: () => 'x' }
    );
    // 1000 × 10 / 50000 — not × 50
    expect(res.delta.positionsUpsert[0].quantity.toNumber()).toBeCloseTo(0.2);
    expect(res.delta.account.leverage).toBe(10);
  });
});
