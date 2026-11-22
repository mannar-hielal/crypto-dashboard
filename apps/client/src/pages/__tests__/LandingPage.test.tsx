import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import React from 'react';

import { guideSelector } from '@/lib/guideAnchors';

vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));
vi.mock('@/components/dashboard/TopBar', () => ({ TopBar: () => null }));
vi.mock('@/components/CtaSection', () => ({ CtaSection: () => null }));
// The lessons' picture module is large; its own test covers the row
vi.mock('@/components/landing/LessonPreviewsLazy', () => ({
  LessonPreviewsLazy: () => React.createElement('div', { 'data-testid': 'lesson-previews' }),
}));
vi.mock('@/components/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: to, ...props }, children),
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

    it('should say it is both a learning app and a real chart in the one headline', async () => {
      await renderLanding();
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.textContent).toMatch(/Learn crypto trading/);
      expect(h1.textContent).toMatch(/Practise on a real chart/);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });

    it('should offer two path cards side by side, each with its bullets', async () => {
      await renderLanding();
      const chart = screen.getByRole('region', { name: 'Open the live chart' });
      const learn = screen.getByRole('region', { name: 'Start learning' });
      expect(within(chart).getByText('No sign up')).not.toBeNull();
      expect(within(learn).getByText('Free account')).not.toBeNull();
      expect(within(chart).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
      expect(within(learn).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
    });

    it('should link the live-chart card to /chart', async () => {
      const { container } = await renderLanding();
      const link = container.querySelector(guideSelector('landing.hero.chart'));
      expect(link?.textContent).toBe('Open the live chart');
      expect(link?.getAttribute('href')).toBe('/chart');
    });

    it('should link the learning card to /register', async () => {
      const { container } = await renderLanding();
      const link = container.querySelector(guideSelector('landing.hero.register'));
      expect(link?.textContent).toBe('Create a free account');
      expect(link?.getAttribute('href')).toBe('/register');
    });

    it('should put the beginner questions right after the hero, as an accordion', async () => {
      await renderLanding();
      const heading = screen.getByRole('heading', { name: 'Questions every beginner asks' });
      expect(heading.tagName).toBe('H2');
      const first = screen.getByRole('button', {
        name: 'I know nothing about crypto. Where do I start?',
      });
      expect(first.getAttribute('aria-expanded')).toBe('true');
      const second = screen.getByRole('button', { name: 'Is this real money? Can I lose any?' });
      expect(second.getAttribute('aria-expanded')).toBe('false');
    });

    it('should end every answer with a Start here button', async () => {
      const { container } = await renderLanding();
      const buttons = container.querySelectorAll(guideSelector('landing.faq.start'));
      expect(buttons.length).toBeGreaterThanOrEqual(6);
      for (const b of buttons) {
        expect(b.textContent).toMatch(/^Start here/);
        expect(b.getAttribute('href')).toMatch(/^\/(register|chart)$/);
      }
    });

    it('should replace the terminal band with a timeline of milestones', async () => {
      await renderLanding();
      expect(screen.queryByText("The chart's free. So is the trading desk.")).toBeNull();
      expect(screen.getByRole('heading', { name: 'From your first click to your first trade' }));
      const steps = screen.getAllByRole('heading', { level: 3, name: /Open the live chart/ });
      expect(steps.length).toBeGreaterThan(0);
    });

    it('should bring the value of learning on real candles, in place of Advanced Charts', async () => {
      await renderLanding();
      expect(screen.getByRole('heading', { name: 'Learn it. Then try it on real candles.' }));
      expect(screen.queryByText('Advanced Charts')).toBeNull();
      expect(screen.getByTestId('lesson-previews')).not.toBeNull();
    });

    it('should give each competitor group its own section, with where they win', async () => {
      await renderLanding();
      expect(screen.getByRole('heading', { name: /No exchange account/ }));
      expect(screen.getByRole('heading', { name: /Practice only. No fees, no deadlines/ }));
      expect(screen.getAllByText('Where they are better.').length).toBe(6);
    });

    it('should show the comparison table and say a record does not help anyone get funded', async () => {
      await renderLanding();
      expect(screen.getByRole('table')).not.toBeNull();
      expect(screen.getAllByText(/does not help anyone get funded/).length).toBeGreaterThanOrEqual(
        2
      );
    });

    it('should name no competitor brand on the page', async () => {
      const { container } = await renderLanding();
      const text = container.textContent ?? '';
      for (const brand of ['TradingView', 'Binance', 'Bybit', 'OKX', 'TradeZella', '3Commas']) {
        expect(text).not.toContain(brand);
      }
    });

    it('should keep the paper-trading disclaimer and make no profit promise', async () => {
      await renderLanding();
      expect(screen.getByText(/Paper trading only: no real money is involved/)).not.toBeNull();
      expect(screen.queryByText(/guaranteed|get rich|passive income/i)).toBeNull();
    });

    it('should open an answer when its question is pressed', async () => {
      await renderLanding();
      const q = screen.getByRole('button', { name: 'Is this real money? Can I lose any?' });
      fireEvent.click(q);
      expect(q.getAttribute('aria-expanded')).toBe('true');
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
      expect(container.querySelector(guideSelector('landing.hero.register'))).toBeNull();
    });

    it('should show no sign-up, chart, FAQ or table before launch', async () => {
      const { container } = await renderLanding();
      expect(screen.queryByRole('heading', { name: 'Questions every beginner asks' })).toBeNull();
      expect(screen.queryByRole('table')).toBeNull();
      expect(container.querySelector('a[href="/register"]')).toBeNull();
      expect(container.querySelector('a[href="/chart"]')).toBeNull();
    });

    it('should link to the How it works page', async () => {
      const { container } = await renderLanding();
      expect(container.querySelector('a[href="/how-it-works"]')).not.toBeNull();
    });
  });
});
