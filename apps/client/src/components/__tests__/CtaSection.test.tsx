import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('@/components/NewsletterForm', () => ({
  NewsletterForm: () => React.createElement('div', { 'data-testid': 'newsletter-form' }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    size?: string;
    asChild?: boolean;
  }) => React.createElement('button', { ...props }, children),
}));

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: to, ...props }, children),
}));

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
}));

vi.mock('@/assets/cta-illustration.svg', () => ({ default: '/img/cta.svg' }));

import { CtaSection } from '../CtaSection';

describe('CtaSection', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('pre-launch state (default)', () => {
    it('shows the launch announcement heading', () => {
      render(React.createElement(CtaSection));
      expect(screen.getByText(/launching soon/i)).not.toBeNull();
    });

    it('renders the NewsletterForm component', () => {
      render(React.createElement(CtaSection));
      expect(screen.getByTestId('newsletter-form')).not.toBeNull();
    });

    it('does not show the live trading CTA', () => {
      render(React.createElement(CtaSection));
      expect(screen.queryByText(/start trading/i)).toBeNull();
    });
  });

  describe('live state', () => {
    beforeEach(() => {
      vi.resetModules();
      process.env.VITE_IS_LIVE = 'true';
    });

    afterEach(() => {
      cleanup();
      delete process.env.VITE_IS_LIVE;
    });

    it('shows the live CTA heading when VITE_IS_LIVE is true', async () => {
      const { CtaSection: LiveCtaSection } = await import('../CtaSection');
      render(React.createElement(LiveCtaSection));
      expect(screen.getByText(/start trading/i)).not.toBeNull();
    });

    it('shows a Get Started Free link when live', async () => {
      const { CtaSection: LiveCtaSection } = await import('../CtaSection');
      render(React.createElement(LiveCtaSection));
      const link = screen.getByText(/get started free/i);
      expect(link).not.toBeNull();
      expect(link.closest('a')?.getAttribute('href')).toBe('/register');
    });

    it('does not render newsletter form when live', async () => {
      const { CtaSection: LiveCtaSection } = await import('../CtaSection');
      render(React.createElement(LiveCtaSection));
      expect(screen.queryByText(/launching soon/i)).toBeNull();
    });
  });
});
