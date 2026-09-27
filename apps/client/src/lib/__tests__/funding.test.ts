/** Funding display helpers (BP-4). */

import { describe, it, expect } from 'vitest';
import { formatFundingCountdown, formatFundingRate, winRateFrom } from '../funding';

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

describe('winRateFrom() (review #143)', () => {
  it('counts closes only — a funding payment is neither a win nor a loss', () => {
    const log = [
      {
        pnl: 12.5,
        action: 'Close long position for BTCUSDT at price 51000.0000 for 0.100000 units',
      },
      { pnl: -3, action: 'Close short position for ETHUSDT at price 3100.0000 for 1.000000 units' },
      {
        pnl: -0.51,
        action: 'Funding fee for long BTCUSDT (rate 0.0100%, mark 51000.0000, 0.100000 units)',
      },
      {
        pnl: 0.51,
        action: 'Funding fee for short BTCUSDT (rate 0.0100%, mark 51000.0000, 0.100000 units)',
      },
      { pnl: 0, action: 'Enter long position for BTCUSDT at price 50000.0000 for 0.100000 units' },
    ];
    expect(winRateFrom(log)).toBe(50);
  });

  it('is null with funding payments but no closed trade', () => {
    expect(
      winRateFrom([{ pnl: 0.51, action: 'Funding fee for short BTCUSDT (rate 0.0100%, …)' }])
    ).toBeNull();
  });
});
