import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import React from 'react';

import { FEATURES_FAQ } from '@/lib/landingContent';
import { CHECK_YOURSELF, WHY_SLIDES } from '@/lib/howItWorksContent';

// The page's claims must match the code: INTERVALS (lib/markets.ts), LAYOUT_ORDER
// (ChartLayoutPicker.tsx), ALLOWED_SYMBOLS (server constants.ts), PaperOrderStatus (SDK).

vi.mock('@/components/SeoHead', () => ({
  SeoHead: ({ jsonLd, noIndex }: { jsonLd?: unknown; noIndex?: boolean }) =>
    React.createElement('script', {
      'data-testid': 'seo',
      'data-json': JSON.stringify(jsonLd),
      'data-noindex': String(!!noIndex),
    }),
}));
vi.mock('@/components/dashboard/TopBar', () => ({ TopBar: () => null }));
vi.mock('@/components/CtaSection', () => ({ CtaSection: () => null }));
vi.mock('@/components/landing/LessonPreviewsLazy', () => ({
  LessonPreviewsLazy: () => null,
}));
vi.mock('@/components/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));
vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: to, ...props }, children),
}));

async function renderPage() {
  const { HowItWorksPage } = await import('@/pages/HowItWorksPage');
  return render(React.createElement(HowItWorksPage));
}

describe('HowItWorksPage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_IS_LIVE', 'true');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('should list the 10 chart intervals when rendered', async () => {
    await renderPage();
    expect(screen.getByText('10 timeframes')).not.toBeNull();
    expect(screen.getByText(/1m, 5m, 15m, 30m, 1h, 2h, 4h, 1D, 1W, 1M/)).not.toBeNull();
  });

  it('should name the five real layout modes when rendered', async () => {
    await renderPage();
    expect(screen.getByText(/single, 2 columns, 2 rows, 3 columns, and a 2×2 grid/)).not.toBeNull();
    expect(screen.queryByText(/1\+3/)).toBeNull();
  });

  it('should list BNB and not DOT among the pairs when rendered', async () => {
    await renderPage();
    const pairs = screen.getAllByText(/BTC, ETH, SOL, BNB/);
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) expect(p.textContent).not.toMatch(/DOT/);
  });

  it('should show the six two-faced chart cards and the reset post-it when rendered', async () => {
    const { container } = await renderPage();
    expect(
      container.querySelectorAll(
        'ul[aria-label="Facts about the chart and the practice account"] > li'
      )
    ).toHaveLength(6);
    expect(screen.getByText('If you reset')).not.toBeNull();
    expect(screen.getByText('Your lessons and progress')).not.toBeNull();
    expect(screen.queryByText(/expired/i)).toBeNull();
  });

  it('should not make the unverified claims when rendered', async () => {
    await renderPage();
    expect(screen.queryByText(/Sub-100ms/i)).toBeNull();
    expect(screen.queryByText('Market Overview')).toBeNull();
    expect(screen.queryByText('OHLCV History')).toBeNull();
    expect(screen.queryByText(/backtest/i)).toBeNull();
    expect(screen.queryByText(/replay/i)).toBeNull();
    expect(screen.queryByText(/R-multiple/i)).toBeNull();
    expect(screen.queryByText(/guaranteed|get rich|passive income/i)).toBeNull();
  });

  it('should have one h1 and open with why the app exists, with no recap', async () => {
    await renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2s[0]).toBe('Why this app exists');
    expect(h2s).not.toContain('Four flows, step by step');
    expect(h2s).toContain('What it is not');
    expect(h2s).not.toContain('Remember 5 things');
  });

  it('should drop the sections that repeated the page: no boxes of guides, chapters or quiz types', async () => {
    await renderPage();
    for (const t of ['Quiz types', 'The checkpoint', 'On your phone, too', 'Real market data']) {
      expect(screen.queryByText(t)).toBeNull();
    }
  });

  it('should give every Why slide its own phone capture', async () => {
    const { container } = await renderPage();
    const slider = container.querySelector('[aria-label="Why this app exists"]')!;
    const srcs = [...slider.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toHaveLength(WHY_SLIDES.length);
    expect(new Set(srcs).size).toBe(WHY_SLIDES.length);
  });

  it('should keep the old Features page out: no link to /features', async () => {
    const { container } = await renderPage();
    expect(container.querySelector('a[href="/features"]')).toBeNull();
  });

  it('should keep the paper-trading disclaimer', async () => {
    await renderPage();
    expect(screen.getByText(/Paper trading only: no real money is involved/)).not.toBeNull();
  });

  it('should link to the blog, the sign-up and the live chart', async () => {
    const { container } = await renderPage();
    expect(container.querySelector('a[href="/blog"]')).not.toBeNull();
    expect(container.querySelector('a[href="/register"]')).not.toBeNull();
    expect(container.querySelector('a[href="/chart"]')).not.toBeNull();
  });

  it('should give the questions as an accordion and as FAQ structured data', async () => {
    const { container } = await renderPage();
    const faq = container.querySelector('#questions') as HTMLElement;
    const buttons = within(faq).getAllByRole('button', { expanded: false });
    // The quick answers, then the self-check questions in the same list
    const total = FEATURES_FAQ.length + CHECK_YOURSELF.length;
    expect(buttons.length).toBe(total);
    const json = JSON.parse(screen.getByTestId('seo').getAttribute('data-json') ?? '{}');
    expect(json['@type']).toBe('FAQPage');
    expect(json.mainEntity).toHaveLength(total);
    expect(json.mainEntity[0].acceptedAnswer.text.length).toBeGreaterThan(10);
  });

  it('should link every section in the anchor nav to a section that exists', async () => {
    const { container } = await renderPage();
    const links = container.querySelectorAll('nav[aria-label="On this page"] a');
    expect(links.length).toBeGreaterThanOrEqual(6);
    for (const a of links) {
      const id = a.getAttribute('href')?.slice(1) ?? '';
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it('should stay out of the index and publish no FAQ data before launch (review 2026-11-22)', async () => {
    vi.stubEnv('VITE_IS_LIVE', 'false');
    await renderPage();
    const seo = screen.getByTestId('seo');
    expect(seo.getAttribute('data-noindex')).toBe('true');
    expect(seo.getAttribute('data-json')).toBeNull();
  });

  it('should be indexable with its FAQ data when live', async () => {
    await renderPage();
    const seo = screen.getByTestId('seo');
    expect(seo.getAttribute('data-noindex')).toBe('false');
    expect(seo.getAttribute('data-json')).toContain('FAQPage');
  });

  it('should say it is launching soon before launch, and not when live', async () => {
    vi.stubEnv('VITE_IS_LIVE', 'false');
    await renderPage();
    expect(screen.getByText(/launching soon/i)).not.toBeNull();
    cleanup();
    vi.resetModules();
    vi.stubEnv('VITE_IS_LIVE', 'true');
    await renderPage();
    expect(screen.queryByText(/launching soon/i)).toBeNull();
  });
});
