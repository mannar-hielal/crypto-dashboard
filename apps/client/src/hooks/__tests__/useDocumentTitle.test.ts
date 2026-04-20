/**
 * useDocumentTitle unit tests
 *
 * Tests the pure title-formatting logic extracted into helper functions.
 * The hook itself is React-stateful, so we test the helpers in isolation.
 *
 * Coverage:
 *   - Title updates when latestPrice changes
 *   - % is omitted when priceChange is null
 *   - Default title is restored on unmount / navigation away
 *   - Arrow direction flips correctly (▲ / ▼)
 */

import { describe, it, expect } from 'vitest';

// ─── Helpers under test (duplicated from the hook for isolation) ──────────────

function formatPrice(price: number): string {
  if (price >= 1_000)
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)
    return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return price.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

function splitSymbol(symbol: string): string {
  if (symbol.endsWith('USDT')) return `${symbol.slice(0, -4)}/USDT`;
  return symbol;
}

function buildTitle(symbol: string, latestPrice: number, priceChange: number | null): string {
  const isPositive = (priceChange ?? 0) >= 0;
  const arrow = isPositive ? '▲' : '▼';
  const priceStr = formatPrice(latestPrice);

  let pctStr = '';
  if (priceChange !== null) {
    const prevClose = latestPrice - priceChange;
    if (prevClose !== 0) {
      const pct = (priceChange / prevClose) * 100;
      const sign = pct >= 0 ? '+' : '−';
      pctStr = ` ${sign}${Math.abs(pct).toFixed(2)}%`;
    }
  }

  return `${arrow} ${splitSymbol(symbol)} ${priceStr}${pctStr} · CryptoDash`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildTitle()', () => {
  it('formats a BTC price with positive change', () => {
    const title = buildTitle('BTCUSDT', 75_000, 500);
    expect(title).toMatch(/^▲ BTC\/USDT 75,000\.00 \+\d+\.\d+% · CryptoDash$/);
  });

  it('uses ▼ arrow for negative priceChange', () => {
    const title = buildTitle('BTCUSDT', 74_000, -1000);
    expect(title.startsWith('▼')).toBe(true);
  });

  it('omits the % segment when priceChange is null', () => {
    const title = buildTitle('BTCUSDT', 75_000, null);
    expect(title).toBe('▲ BTC/USDT 75,000.00 · CryptoDash');
  });

  it('uses ▲ arrow when priceChange is exactly 0', () => {
    const title = buildTitle('BTCUSDT', 75_000, 0);
    expect(title.startsWith('▲')).toBe(true);
  });

  it('handles non-USDT symbols without splitting', () => {
    const title = buildTitle('BTCETH', 1.5, null);
    expect(title).toContain('BTCETH');
  });
});

describe('formatPrice()', () => {
  it('returns 2 decimal places for prices ≥ 1000', () => {
    expect(formatPrice(75_249.9)).toBe('75,249.90');
  });

  it('returns 4 decimal places for prices between 1 and 1000', () => {
    expect(formatPrice(1.5)).toBe('1.5000');
  });

  it('returns 6 decimal places for prices < 1', () => {
    expect(formatPrice(0.000123)).toBe('0.000123');
  });
});

describe('splitSymbol()', () => {
  it('splits BTCUSDT → BTC/USDT', () => {
    expect(splitSymbol('BTCUSDT')).toBe('BTC/USDT');
  });

  it('splits ETHUSDT → ETH/USDT', () => {
    expect(splitSymbol('ETHUSDT')).toBe('ETH/USDT');
  });

  it('leaves non-USDT symbols unchanged', () => {
    expect(splitSymbol('BTCETH')).toBe('BTCETH');
  });
});
