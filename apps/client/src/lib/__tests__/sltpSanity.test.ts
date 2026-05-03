/**
 * sltpSanity unit tests  (T1 · Vitest)
 *
 * Tests the pure computeSLTPWarnings() helper for all guarded failure modes:
 *   - Typo guard: value deviates > TYPO_DEVIATION_THRESHOLD from live price
 *   - Large-distance guard: |entry − sl| / entry > SL_MAX_DISTANCE (SL only)
 *   - Well-formed inputs: both warnings null
 *   - Short position variants
 *   - Invalid inputs: object returned with null fields, no crash
 *
 * Root cause test: the 4.18 incident involved BTC live price ~78 000 and a
 * manually entered SL of 7 800 (order-of-magnitude typo). This test suite
 * ensures that scenario produces a non-null typoWarning.
 */

import { describe, it, expect } from 'vitest';
import { computeSLTPWarnings, TYPO_DEVIATION_THRESHOLD, SL_MAX_DISTANCE } from '../sltpSanity';
import { fmtMktPrice } from '../utils';

// ─── Constants sanity check ───────────────────────────────────────────────────

describe('exported constants', () => {
  it('TYPO_DEVIATION_THRESHOLD is 0.8 (80%)', () => {
    expect(TYPO_DEVIATION_THRESHOLD).toBe(0.8);
  });

  it('SL_MAX_DISTANCE is 0.1 (10%)', () => {
    expect(SL_MAX_DISTANCE).toBe(0.1);
  });
});

// ─── Typo guard ───────────────────────────────────────────────────────────────

describe('computeSLTPWarnings() — typo guard (SL field)', () => {
  const LIVE = 78_000;
  const EXEC = 78_000;

  it('4.18 incident: SL = 7800 on BTC at 78000 → typoWarning non-null', () => {
    const result = computeSLTPWarnings(7_800, EXEC, LIVE, 'SL');
    expect(result.typoWarning).not.toBeNull();
    expect(result.typoWarning).toContain('looks like a typo');
    expect(result.typoWarning).toContain(`$${fmtMktPrice(7_800)}`);
    expect(result.typoWarning).toContain(`$${fmtMktPrice(78_000)}`);
  });

  it('BTC SL at one-tenth of price → typoWarning non-null', () => {
    // 7800 / 78000 = 90% deviation → above 80% threshold
    const result = computeSLTPWarnings(7_800, EXEC, LIVE, 'SL');
    expect(result.typoWarning).not.toBeNull();
  });

  it('SL at reasonable distance (5% below live price) → typoWarning null', () => {
    const sl = LIVE * 0.95; // ~74 100 — 5% below 78 000
    const result = computeSLTPWarnings(sl, EXEC, LIVE, 'SL');
    expect(result.typoWarning).toBeNull();
  });

  it('SL exactly at TYPO_DEVIATION_THRESHOLD boundary → typoWarning null', () => {
    // deviation = exactly 0.80 — should NOT fire (strict >)
    const sl = LIVE * (1 - TYPO_DEVIATION_THRESHOLD); // 78000 * 0.20 = 15 600
    const result = computeSLTPWarnings(sl, EXEC, LIVE, 'SL');
    expect(result.typoWarning).toBeNull();
  });

  it('SL just beyond TYPO_DEVIATION_THRESHOLD → typoWarning non-null', () => {
    // deviation = 0.81 → above threshold
    const sl = LIVE * (1 - TYPO_DEVIATION_THRESHOLD - 0.01); // ~78 000 * 0.19
    const result = computeSLTPWarnings(sl, EXEC, LIVE, 'SL');
    expect(result.typoWarning).not.toBeNull();
  });

  it('SL above live price (typo in other direction) → typoWarning non-null', () => {
    // 780 000 is 10× live price — 900% deviation
    const result = computeSLTPWarnings(780_000, EXEC, LIVE, 'SL');
    expect(result.typoWarning).not.toBeNull();
  });
});

describe('computeSLTPWarnings() — typo guard (TP field)', () => {
  const LIVE = 78_000;
  const EXEC = 78_000;

  it('TP = 7800 (10x lower) → typoWarning non-null', () => {
    const result = computeSLTPWarnings(7_800, EXEC, LIVE, 'TP');
    expect(result.typoWarning).not.toBeNull();
  });

  it('Reasonable TP (10% above live price) → typoWarning null', () => {
    const tp = LIVE * 1.1; // ~85 800
    const result = computeSLTPWarnings(tp, EXEC, LIVE, 'TP');
    expect(result.typoWarning).toBeNull();
  });
});

// ─── Large-distance guard (SL only) ──────────────────────────────────────────

describe('computeSLTPWarnings() — large-distance guard', () => {
  const LIVE = 78_000;

  it('SL 11% below exec price → largeDistanceWarning non-null', () => {
    const exec = 78_000;
    const sl = exec * (1 - SL_MAX_DISTANCE - 0.01); // ~11% away
    const result = computeSLTPWarnings(sl, exec, LIVE, 'SL');
    expect(result.largeDistanceWarning).not.toBeNull();
  });

  it('SL exactly at SL_MAX_DISTANCE → largeDistanceWarning null (strict >)', () => {
    const exec = 78_000;
    const sl = exec * (1 - SL_MAX_DISTANCE); // exactly 10% away
    const result = computeSLTPWarnings(sl, exec, LIVE, 'SL');
    expect(result.largeDistanceWarning).toBeNull();
  });

  it('SL 5% below exec price → largeDistanceWarning null', () => {
    const exec = 78_000;
    const sl = exec * 0.95; // 5% away
    const result = computeSLTPWarnings(sl, exec, LIVE, 'SL');
    expect(result.largeDistanceWarning).toBeNull();
  });

  it('TP 20% above exec price → largeDistanceWarning null (TP is exempt from distance guard)', () => {
    const exec = 78_000;
    const tp = exec * 1.2;
    const result = computeSLTPWarnings(tp, exec, LIVE, 'TP');
    expect(result.largeDistanceWarning).toBeNull();
  });
});

// ─── Both warnings null for well-formed inputs ───────────────────────────────

describe('computeSLTPWarnings() — well-formed inputs', () => {
  it('BTC Long — normal SL 3% below entry → both warnings null', () => {
    const live = 78_000;
    const exec = 78_000;
    const sl = 75_600; // ~3.1% below
    const result = computeSLTPWarnings(sl, exec, live, 'SL');
    expect(result.typoWarning).toBeNull();
    expect(result.largeDistanceWarning).toBeNull();
  });

  it('BTC Long — normal TP 5% above entry → both warnings null', () => {
    const live = 78_000;
    const exec = 78_000;
    const tp = 81_900; // 5% above
    const result = computeSLTPWarnings(tp, exec, live, 'TP');
    expect(result.typoWarning).toBeNull();
    expect(result.largeDistanceWarning).toBeNull();
  });

  it('Short position — SL 3% above entry → both warnings null', () => {
    const live = 78_000;
    const exec = 78_000;
    const sl = 80_340; // 3% above
    const result = computeSLTPWarnings(sl, exec, live, 'SL');
    expect(result.typoWarning).toBeNull();
    expect(result.largeDistanceWarning).toBeNull();
  });
});

// ─── Invalid / degenerate inputs ─────────────────────────────────────────────

describe('computeSLTPWarnings() — invalid inputs', () => {
  it('value = 0 → both warnings null (no crash)', () => {
    const result = computeSLTPWarnings(0, 78_000, 78_000, 'SL');
    expect(result.typoWarning).toBeNull();
    expect(result.largeDistanceWarning).toBeNull();
  });

  it('value = NaN → both warnings null', () => {
    const result = computeSLTPWarnings(NaN, 78_000, 78_000, 'SL');
    expect(result.typoWarning).toBeNull();
    expect(result.largeDistanceWarning).toBeNull();
  });

  it('execPrice = 0 → both warnings null', () => {
    const result = computeSLTPWarnings(7_800, 0, 78_000, 'SL');
    expect(result.typoWarning).toBeNull();
    expect(result.largeDistanceWarning).toBeNull();
  });

  it('livePrice = 0 → both warnings null', () => {
    const result = computeSLTPWarnings(7_800, 78_000, 0, 'SL');
    // livePrice = 0 would divide by zero — guard must return nulls
    expect(result.typoWarning).toBeNull();
    expect(result.largeDistanceWarning).toBeNull();
  });
});
