/**
 * checkTPSL unit tests
 *
 * The breach-check logic is extracted as a pure function so it can be
 * tested in isolation — no React, no store, no side effects.
 *
 * Coverage:
 *   - Long:  TP hit, SL hit, no trigger
 *   - Short: TP hit, SL hit, no trigger
 *   - Boundary conditions (price exactly at level)
 *   - Positions without TP/SL set
 */

import { describe, it, expect } from 'vitest';
import { checkTPSL } from '../useTPSLMonitor';

// ─── Long positions ───────────────────────────────────────────────────────────

describe('checkTPSL() — long positions', () => {
  it('returns "TP" when price reaches takeProfit (exact)', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 50_000 }, 50_000)).toBe('TP');
  });

  it('returns "TP" when price exceeds takeProfit', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 50_000 }, 51_000)).toBe('TP');
  });

  it('returns "SL" when price drops to stopLoss (exact)', () => {
    expect(checkTPSL({ side: 'long', stopLoss: 40_000 }, 40_000)).toBe('SL');
  });

  it('returns "SL" when price drops below stopLoss', () => {
    expect(checkTPSL({ side: 'long', stopLoss: 40_000 }, 39_000)).toBe('SL');
  });

  it('returns null when price is between SL and TP', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 50_000, stopLoss: 40_000 }, 45_000)).toBeNull();
  });

  it('returns "TP" — TP is checked before SL (TP wins if both breach simultaneously)', () => {
    // Pathological: TP <= SL (misconfigured). TP check runs first, so TP wins.
    expect(checkTPSL({ side: 'long', takeProfit: 40_000, stopLoss: 50_000 }, 55_000)).toBe('TP');
  });

  it('returns null when neither TP nor SL is configured', () => {
    expect(checkTPSL({ side: 'long' }, 99_999)).toBeNull();
  });

  it('returns null when only TP is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'long', takeProfit: 60_000 }, 55_000)).toBeNull();
  });

  it('returns null when only SL is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'long', stopLoss: 30_000 }, 35_000)).toBeNull();
  });
});

// ─── Short positions ──────────────────────────────────────────────────────────

describe('checkTPSL() — short positions', () => {
  it('returns "TP" when price drops to takeProfit (exact)', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 40_000 }, 40_000)).toBe('TP');
  });

  it('returns "TP" when price drops below takeProfit', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 40_000 }, 39_000)).toBe('TP');
  });

  it('returns "SL" when price rises to stopLoss (exact)', () => {
    expect(checkTPSL({ side: 'short', stopLoss: 55_000 }, 55_000)).toBe('SL');
  });

  it('returns "SL" when price rises above stopLoss', () => {
    expect(checkTPSL({ side: 'short', stopLoss: 55_000 }, 56_000)).toBe('SL');
  });

  it('returns null when price is between TP and SL', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 40_000, stopLoss: 55_000 }, 48_000)).toBeNull();
  });

  it('returns null when neither TP nor SL is configured', () => {
    expect(checkTPSL({ side: 'short' }, 1)).toBeNull();
  });

  it('returns null when only TP is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'short', takeProfit: 30_000 }, 35_000)).toBeNull();
  });

  it('returns null when only SL is set and price has not reached it', () => {
    expect(checkTPSL({ side: 'short', stopLoss: 60_000 }, 55_000)).toBeNull();
  });
});
