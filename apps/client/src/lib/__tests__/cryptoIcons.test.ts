/**
 * cryptoIcons tests
 *
 * Verifies the structure of CRYPTO_ICON_URLS:
 *   - Exactly the 10 expected base symbols are present
 *   - All keys are uppercase strings
 *   - All values are non-empty strings (Vite resolves ?url imports to asset paths in tests)
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Mock all ?url SVG imports ────────────────────────────────────────────────
// Vite's ?url transform is not available in the test runner; provide stub paths.

vi.mock('cryptocurrency-icons/svg/color/btc.svg?url', () => ({ default: '/icons/btc.svg' }));
vi.mock('cryptocurrency-icons/svg/color/eth.svg?url', () => ({ default: '/icons/eth.svg' }));
vi.mock('cryptocurrency-icons/svg/color/sol.svg?url', () => ({ default: '/icons/sol.svg' }));
vi.mock('cryptocurrency-icons/svg/color/bnb.svg?url', () => ({ default: '/icons/bnb.svg' }));
vi.mock('cryptocurrency-icons/svg/color/xrp.svg?url', () => ({ default: '/icons/xrp.svg' }));
vi.mock('cryptocurrency-icons/svg/color/doge.svg?url', () => ({ default: '/icons/doge.svg' }));
vi.mock('cryptocurrency-icons/svg/color/ada.svg?url', () => ({ default: '/icons/ada.svg' }));
vi.mock('cryptocurrency-icons/svg/color/avax.svg?url', () => ({ default: '/icons/avax.svg' }));
vi.mock('cryptocurrency-icons/svg/color/link.svg?url', () => ({ default: '/icons/link.svg' }));
vi.mock('cryptocurrency-icons/svg/color/usdt.svg?url', () => ({ default: '/icons/usdt.svg' }));

import { CRYPTO_ICON_URLS } from '../cryptoIcons';

// ─── Expected symbols ─────────────────────────────────────────────────────────

const EXPECTED_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'USDT'];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CRYPTO_ICON_URLS', () => {
  it('should contain exactly 10 entries', () => {
    expect(Object.keys(CRYPTO_ICON_URLS)).toHaveLength(10);
  });

  it('should have all expected symbol keys', () => {
    for (const sym of EXPECTED_SYMBOLS) {
      expect(CRYPTO_ICON_URLS).toHaveProperty(sym);
    }
  });

  it('should have only uppercase keys', () => {
    for (const key of Object.keys(CRYPTO_ICON_URLS)) {
      expect(key).toBe(key.toUpperCase());
    }
  });

  it('should have non-empty string values for all entries', () => {
    for (const [key, value] of Object.entries(CRYPTO_ICON_URLS)) {
      expect(typeof value, `value for ${key} should be a string`).toBe('string');
      expect(value.length, `value for ${key} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('should have unique values for each symbol', () => {
    const values = Object.values(CRYPTO_ICON_URLS);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });
});
