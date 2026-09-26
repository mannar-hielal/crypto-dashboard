/**
 * Market URLs (BP-2): /dashboard/spot/BTC/USDT and /dashboard/usdt/BTCUSDT, Bybit's scheme.
 */

import { describe, it, expect } from 'vitest';
import { marketPath, parseMarketPath, routeKey, safeReturnPath } from '../marketRoutes';

describe('marketPath()', () => {
  it('Spot is base / quote, USDT Perpetual the symbol', () => {
    expect(marketPath({ category: 'spot', symbol: 'BTCUSDT' })).toBe('/dashboard/spot/BTC/USDT');
    expect(marketPath({ category: 'linear', symbol: 'ETHUSDT' })).toBe('/dashboard/usdt/ETHUSDT');
  });
});

describe('parseMarketPath()', () => {
  it('reads both markets and gives the canonical URL', () => {
    expect(parseMarketPath('/dashboard/spot/BTC/USDT')).toEqual({
      category: 'spot',
      symbol: 'BTCUSDT',
      canonical: '/dashboard/spot/BTC/USDT',
    });
    expect(parseMarketPath('/dashboard/usdt/SOLUSDT')).toMatchObject({
      category: 'linear',
      symbol: 'SOLUSDT',
    });
  });

  it('is case-insensitive and tolerates a trailing slash (canonical URL to replace it)', () => {
    expect(parseMarketPath('/dashboard/spot/btc/usdt/')?.canonical).toBe(
      '/dashboard/spot/BTC/USDT'
    );
    expect(parseMarketPath('/dashboard/usdt/ethusdt')?.canonical).toBe('/dashboard/usdt/ETHUSDT');
  });

  it.each([
    '/dashboard',
    '/dashboard/spot/PEPE/USDT', // not a symbol we trade
    '/dashboard/spot/BTC/EUR', // not a USDT pair
    '/dashboard/usdt/BTC',
    '/dashboard/inverse/BTCUSD',
    '/dashboard/spot/BTC',
    '/chart',
  ])('returns null for %s', (path) => {
    expect(parseMarketPath(path)).toBeNull();
  });
});

describe('safeReturnPath() — 🔐 no open redirect after sign-in', () => {
  it('accepts a market URL we trade', () => {
    expect(safeReturnPath('/dashboard/usdt/BTCUSDT')).toBe('/dashboard/usdt/BTCUSDT');
  });

  it.each([
    'https://evil.example/dashboard/usdt/BTCUSDT',
    '//evil.example/dashboard/usdt/BTCUSDT',
    '/admin/newsletter',
    '/dashboard/usdt/BTCUSDT?next=https://evil.example',
    undefined,
    42,
  ])('refuses %s', (from) => {
    expect(safeReturnPath(from)).toBeNull();
  });
});

describe('routeKey()', () => {
  it('keys every dashboard URL as one page (switching market never remounts it)', () => {
    expect(routeKey('/dashboard')).toBe('/dashboard');
    expect(routeKey('/dashboard/spot/BTC/USDT')).toBe('/dashboard');
    expect(routeKey('/dashboard/usdt/ETHUSDT')).toBe('/dashboard');
    expect(routeKey('/chart')).toBe('/chart');
    expect(routeKey('/dashboardx')).toBe('/dashboardx');
  });
});
