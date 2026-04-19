/**
 * checkPendingTrigger unit tests
 *
 * The trigger-check logic is extracted as a pure function so it can be
 * tested in isolation — no React, no store, no side effects.
 *
 * Coverage:
 *   - Limit Buy:  triggers when price <= triggerPrice
 *   - Limit Sell: triggers when price >= triggerPrice
 *   - Stop  Buy:  triggers when price >= triggerPrice
 *   - Stop  Sell: triggers when price <= triggerPrice
 *   - Boundary conditions (price exactly at triggerPrice)
 *   - No-trigger cases for all four combinations
 */

import { describe, it, expect } from 'vitest';
import { checkPendingTrigger } from '../usePendingOrderMonitor';

// ─── Limit Buy ────────────────────────────────────────────────────────────────

describe('checkPendingTrigger() — Limit Buy', () => {
  const base = { side: 'buy' as const, type: 'limit' as const, triggerPrice: 50_000 };

  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, 50_000)).toBe(true);
  });

  it('triggers when price drops below triggerPrice', () => {
    expect(checkPendingTrigger(base, 49_000)).toBe(true);
  });

  it('does NOT trigger when price is above triggerPrice', () => {
    expect(checkPendingTrigger(base, 51_000)).toBe(false);
  });
});

// ─── Limit Sell ───────────────────────────────────────────────────────────────

describe('checkPendingTrigger() — Limit Sell', () => {
  const base = { side: 'sell' as const, type: 'limit' as const, triggerPrice: 60_000 };

  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, 60_000)).toBe(true);
  });

  it('triggers when price rises above triggerPrice', () => {
    expect(checkPendingTrigger(base, 61_000)).toBe(true);
  });

  it('does NOT trigger when price is below triggerPrice', () => {
    expect(checkPendingTrigger(base, 59_000)).toBe(false);
  });
});

// ─── Stop Buy ─────────────────────────────────────────────────────────────────

describe('checkPendingTrigger() — Stop Buy', () => {
  const base = { side: 'buy' as const, type: 'stop' as const, triggerPrice: 55_000 };

  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, 55_000)).toBe(true);
  });

  it('triggers when price rises above triggerPrice (breakout)', () => {
    expect(checkPendingTrigger(base, 56_000)).toBe(true);
  });

  it('does NOT trigger when price is below triggerPrice', () => {
    expect(checkPendingTrigger(base, 54_000)).toBe(false);
  });
});

// ─── Stop Sell ────────────────────────────────────────────────────────────────

describe('checkPendingTrigger() — Stop Sell', () => {
  const base = { side: 'sell' as const, type: 'stop' as const, triggerPrice: 45_000 };

  it('triggers when price equals triggerPrice (exact fill)', () => {
    expect(checkPendingTrigger(base, 45_000)).toBe(true);
  });

  it('triggers when price drops below triggerPrice (breakdown)', () => {
    expect(checkPendingTrigger(base, 44_000)).toBe(true);
  });

  it('does NOT trigger when price is above triggerPrice', () => {
    expect(checkPendingTrigger(base, 46_000)).toBe(false);
  });
});

// ─── Boundary — price exactly one tick away ───────────────────────────────────

describe('checkPendingTrigger() — one tick away (should NOT trigger)', () => {
  it('Limit Buy: price 1 above trigger — no fill', () => {
    expect(checkPendingTrigger({ side: 'buy', type: 'limit', triggerPrice: 50_000 }, 50_001)).toBe(
      false
    );
  });

  it('Limit Sell: price 1 below trigger — no fill', () => {
    expect(checkPendingTrigger({ side: 'sell', type: 'limit', triggerPrice: 60_000 }, 59_999)).toBe(
      false
    );
  });

  it('Stop Buy: price 1 below trigger — no fill', () => {
    expect(checkPendingTrigger({ side: 'buy', type: 'stop', triggerPrice: 55_000 }, 54_999)).toBe(
      false
    );
  });

  it('Stop Sell: price 1 above trigger — no fill', () => {
    expect(checkPendingTrigger({ side: 'sell', type: 'stop', triggerPrice: 45_000 }, 45_001)).toBe(
      false
    );
  });
});
