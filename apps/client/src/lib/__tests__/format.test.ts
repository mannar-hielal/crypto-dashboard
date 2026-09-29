import { describe, expect, it } from 'vitest';
import { fmtSigned, fmtSignedPct, fmtSignedUsd, fmtUsd } from '../format';

describe('number formats like Bybit (visual gate 2026-09-29)', () => {
  it('should put the sign before the $ and group thousands', () => {
    expect(fmtSignedUsd(-10.12)).toBe('-$10.12');
    expect(fmtSignedUsd(47.2225, 4)).toBe('+$47.2225');
    expect(fmtUsd(1002.2)).toBe('$1,002.20');
    expect(fmtUsd(-1234.5)).toBe('-$1,234.50');
  });

  it('should show zero without a sign, also when a tiny value rounds to zero', () => {
    expect(fmtSignedUsd(0)).toBe('$0.00');
    expect(fmtSigned(0)).toBe('0.00');
    expect(fmtSigned(-0.001)).toBe('0.00');
    expect(fmtUsd(-0.001)).toBe('$0.00');
    expect(fmtSignedPct(0)).toBe('0.00%');
  });

  it('should sign amounts without a currency', () => {
    expect(fmtSigned(12.5)).toBe('+12.50');
    expect(fmtSigned(-5.1)).toBe('-5.10');
    expect(fmtSigned(-1234.5)).toBe('-1,234.50');
    expect(fmtSignedPct(-0.4)).toBe('-0.40%');
  });
});
