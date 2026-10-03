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

describe('CtaSection', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Both states stub the flag: a developer's .env.local (VITE_IS_LIVE=true) must not decide them
  describe('pre-launch state', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv('VITE_IS_LIVE', 'false');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    const renderPreLaunch = async () => {
      const { CtaSection: PreLaunchCtaSection } = await import('../CtaSection');
      render(React.createElement(PreLaunchCtaSection));
    };

    it('shows the launch announcement heading', async () => {
      await renderPreLaunch();
      expect(screen.getByText(/launching soon/i)).not.toBeNull();
    });

    it('renders the NewsletterForm component', async () => {
      await renderPreLaunch();
      expect(screen.getByTestId('newsletter-form')).not.toBeNull();
    });

    it('does not show the live trading CTA', async () => {
      await renderPreLaunch();
      expect(screen.queryByText(/create your free account/i)).toBeNull();
    });
  });

  describe('live state', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv('VITE_IS_LIVE', 'true');
    });

    afterEach(() => {
      cleanup();
      vi.unstubAllEnvs();
    });

    it('shows the live CTA heading when VITE_IS_LIVE is true', async () => {
      const { CtaSection: LiveCtaSection } = await import('../CtaSection');
      render(React.createElement(LiveCtaSection));
      expect(screen.getByText(/create your free account/i)).not.toBeNull();
      expect(screen.queryByText(/20 seconds/i)).toBeNull();
    });

    it('shows a Create Free Account link when live', async () => {
      const { CtaSection: LiveCtaSection } = await import('../CtaSection');
      render(React.createElement(LiveCtaSection));
      const link = screen.getByText(/create free account/i);
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
