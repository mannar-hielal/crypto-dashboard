/** Funding display helpers (BP-4). */

import { describe, it, expect } from 'vitest';
import { formatFundingCountdown, formatFundingRate } from '../funding';

describe('formatFundingCountdown()', () => {
  it('shows HH:MM:SS to the next settlement', () => {
    expect(formatFundingCountdown(1_000_000 + (4 * 3600 + 12 * 60 + 33) * 1000, 1_000_000)).toBe(
      '04:12:33'
    );
  });

  it('never goes negative, and is — when unknown', () => {
    expect(formatFundingCountdown(1_000, 5_000)).toBe('00:00:00');
    expect(formatFundingCountdown(null, 5_000)).toBe('—');
  });
});

describe('formatFundingRate()', () => {
  it('shows the rate as Bybit does, 4 decimals of a percent', () => {
    expect(formatFundingRate(0.00002184)).toBe('0.0022%');
    expect(formatFundingRate(-0.0001)).toBe('-0.0100%');
    expect(formatFundingRate(null)).toBe('—');
  });
});
