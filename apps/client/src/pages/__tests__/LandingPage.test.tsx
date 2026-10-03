import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

import { guideSelector } from '@/lib/guideAnchors';

vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));
vi.mock('@/components/dashboard/TopBar', () => ({ TopBar: () => null }));
vi.mock('@/components/CtaSection', () => ({ CtaSection: () => null }));
vi.mock('@/components/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: to, ...props }, children),
}));

const MOTION_PROPS = [
  'variants',
  'initial',
  'animate',
  'exit',
  'transition',
  'whileInView',
  'viewport',
];

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(
          ({ children, ...props }: Record<string, unknown>, ref: React.Ref<unknown>) => {
            const domProps = { ...props };
            for (const k of MOTION_PROPS) delete domProps[k];
            return React.createElement(tag, { ...domProps, ref }, children as React.ReactNode);
          }
        ),
    }
  ),
}));

async function renderLanding() {
  const { LandingPage } = await import('../LandingPage');
  return render(React.createElement(LandingPage));
}

describe('LandingPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  // The flag is stubbed in both states: a developer's .env.local must not decide them
  describe('live state', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv('VITE_IS_LIVE', 'true');
    });

    it('should show the try-first headline when live', async () => {
      await renderLanding();
      expect(screen.getByText('Live crypto charts.')).not.toBeNull();
      expect(screen.getByText('No signup.')).not.toBeNull();
      expect(screen.getByText('Open it. Draw on it. Decide later.')).not.toBeNull();
      expect(screen.getByText(/live charts · no signup/i)).not.toBeNull();
    });

    it('should link the primary hero button to /chart when live', async () => {
      const { container } = await renderLanding();
      const link = container.querySelector(guideSelector('landing.hero.chart'));
      expect(link?.textContent).toBe('Open the Live Chart');
      expect(link?.getAttribute('href')).toBe('/chart');
    });

    it('should link the secondary hero button to /register when live', async () => {
      const { container } = await renderLanding();
      const link = container.querySelector(guideSelector('landing.hero.register'));
      expect(link?.textContent).toBe('Create Free Account');
      expect(link?.getAttribute('href')).toBe('/register');
    });

    it('should render the account-unlocks band when live', async () => {
      const { container } = await renderLanding();
      expect(screen.getByText("The chart's free. So is the trading desk.")).not.toBeNull();
      expect(container.querySelector(guideSelector('landing.unlocks.register'))).not.toBeNull();
    });

    it('should not repeat the sign-up promises the try-first copy replaced when live', async () => {
      await renderLanding();
      expect(screen.queryByText(/20 seconds/i)).toBeNull();
      expect(screen.queryByText('Try It Now')).toBeNull();
      expect(screen.queryByText(/log in to see live charts/i)).toBeNull();
    });

    it('should claim 10 timeframes and label the illustration in USDT when live', async () => {
      await renderLanding();
      expect(screen.getByText(/10 timeframes/)).not.toBeNull();
      expect(screen.queryByText(/6 timeframes/)).toBeNull();
      expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThan(0);
      expect(screen.queryByText('BTC/USD')).toBeNull();
    });
  });

  describe('pre-launch state', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv('VITE_IS_LIVE', 'false');
    });

    it('should keep the launching-soon hero when not live', async () => {
      const { container } = await renderLanding();
      expect(screen.getByText(/launching soon/i)).not.toBeNull();
      expect(screen.getByText('Get notified when live')).not.toBeNull();
      expect(container.querySelector(guideSelector('landing.hero.chart'))).toBeNull();
      expect(screen.queryByText(/20 seconds/i)).toBeNull();
    });

    it('should hide the account-unlocks band when not live (no sign-up before launch)', async () => {
      const { container } = await renderLanding();
      expect(screen.queryByText("The chart's free. So is the trading desk.")).toBeNull();
      expect(container.querySelector(guideSelector('landing.unlocks.register'))).toBeNull();
    });
  });
});
