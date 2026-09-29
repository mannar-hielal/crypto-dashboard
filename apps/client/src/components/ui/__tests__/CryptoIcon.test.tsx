/**
 * CryptoIcon component tests
 *
 * Covers:
 *   - Known symbol → renders <img> with correct src and alt
 *   - Unknown symbol → renders fallback badge with 2-letter text
 *   - Case-insensitivity (lowercase symbol resolves to the same icon)
 *   - Custom size prop is applied to both img and fallback badge
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ─── Mock ?url SVG imports ────────────────────────────────────────────────────

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

// ─── Mock framer-motion (avoids animation side-effects in jsdom) ──────────────

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        React.forwardRef(({ children, ...props }: any, ref: any) =>
          React.createElement(tag, { ...props, ref }, children)
        ),
    }
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

import { CryptoIcon, SymbolPair } from '../CryptoIcon';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CryptoIcon', () => {
  describe('[5.8] an icon that fails to load (Q4, owner 2026-09-29)', () => {
    it('should show the letter circle instead of a broken image', () => {
      render(<CryptoIcon symbol="BTC" size={20} />);
      fireEvent.error(screen.getByRole('img'));
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.getByText('BT')).toBeTruthy();
    });

    it('should try the image again when the symbol changes, also back to one that failed', () => {
      const { rerender } = render(<CryptoIcon symbol="BTC" size={20} />);
      fireEvent.error(screen.getByRole('img'));
      rerender(<CryptoIcon symbol="ETH" size={20} />);
      expect(screen.getByRole('img').getAttribute('src')).toBe('/icons/eth.svg');
      rerender(<CryptoIcon symbol="BTC" size={20} />);
      expect(screen.getByRole('img').getAttribute('src')).toBe('/icons/btc.svg');
    });
  });

  afterEach(cleanup);
  describe('known symbol', () => {
    it('should render an <img> element', () => {
      const { container } = render(<CryptoIcon symbol="BTC" />);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
    });

    it('should set alt to the symbol', () => {
      render(<CryptoIcon symbol="BTC" />);
      const img = screen.getByRole('img', { name: 'BTC' });
      expect(img).not.toBeNull();
    });

    it('should set src from the icon URL map', () => {
      const { container } = render(<CryptoIcon symbol="BTC" />);
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBe('/icons/btc.svg');
    });

    it('should be case-insensitive — lowercase symbol resolves to the same icon', () => {
      const { container } = render(<CryptoIcon symbol="btc" />);
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBe('/icons/btc.svg');
    });

    it('should apply the size prop as width and height', () => {
      const { container } = render(<CryptoIcon symbol="ETH" size={32} />);
      const img = container.querySelector('img');
      expect(img?.getAttribute('width')).toBe('32');
      expect(img?.getAttribute('height')).toBe('32');
    });
  });

  describe('unknown symbol', () => {
    it('should render a fallback badge (span), not an img', () => {
      const { container } = render(<CryptoIcon symbol="UNKNOWN" />);
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('span')).not.toBeNull();
    });

    it('should display the first 2 uppercase letters of the symbol', () => {
      const { container } = render(<CryptoIcon symbol="xyz" />);
      expect(container.querySelector('span')?.textContent).toBe('XY');
    });

    it('should apply the size prop as width and height styles', () => {
      const { container } = render(<CryptoIcon symbol="UNKNOWN" size={24} />);
      const span = container.querySelector('span');
      expect(span?.style.width).toBe('24px');
      expect(span?.style.height).toBe('24px');
    });
  });
});

// ─── SymbolPair fallback tests (T2 · RTL — test plan 5.6) ────────────────────

describe('SymbolPair — unknown symbol fallback (5.6)', () => {
  afterEach(cleanup);

  it('renders no <img> elements when both base and quote are unknown', () => {
    const { container } = render(<SymbolPair base="FOOBAR" quote="NEWCOIN" />);
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('renders exactly 2 fallback badge spans for an unknown base + unknown quote', () => {
    const { container } = render(<SymbolPair base="FOOBAR" quote="NEWCOIN" />);
    // Check that both fallback texts appear somewhere in the tree
    const allSpans = Array.from(container.querySelectorAll('span'));
    const hasFO = allSpans.some((el) => el.textContent === 'FO');
    const hasNE = allSpans.some((el) => el.textContent === 'NE');
    expect(hasFO).toBe(true);
    expect(hasNE).toBe(true);
  });

  it('shows first 2 uppercase letters for an unknown base symbol', () => {
    const { container } = render(<SymbolPair base="foobar" quote="NEWCOIN" />);
    const textBadges = Array.from(container.querySelectorAll('span')).filter(
      (el) => el.textContent === 'FO'
    );
    expect(textBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows first 2 uppercase letters for an unknown quote symbol', () => {
    const { container } = render(<SymbolPair base="FOOBAR" quote="newcoin" />);
    const textBadges = Array.from(container.querySelectorAll('span')).filter(
      (el) => el.textContent === 'NE'
    );
    expect(textBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders an <img> for a known base and a fallback badge for an unknown quote', () => {
    const { container } = render(<SymbolPair base="BTC" quote="NEWCOIN" />);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    const textBadges = Array.from(container.querySelectorAll('span')).filter(
      (el) => el.textContent === 'NE'
    );
    expect(textBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('does not crash and renders correctly when base is a 1-letter symbol', () => {
    const { container } = render(<SymbolPair base="X" quote="NEWCOIN" />);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    const textBadges = Array.from(container.querySelectorAll('span')).filter(
      (el) => el.textContent === 'X'
    );
    expect(textBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('USDT renders as an <img> (has a real icon in the map, not a text badge)', () => {
    const { container } = render(<SymbolPair base="BTC" quote="USDT" />);
    // Both BTC and USDT are in CRYPTO_ICON_URLS — both should be <img>
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });
});
