import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { ABOUT } from '@/lib/aboutContent';

vi.mock('@/components/SeoHead', () => ({
  SeoHead: ({ noIndex, path }: { noIndex?: boolean; path: string }) => (
    <script data-testid="seo" data-noindex={String(!!noIndex)} data-path={path} />
  ),
}));
vi.mock('@/components/dashboard/TopBar', () => ({ TopBar: () => null }));
vi.mock('@/components/CtaSection', () => ({ CtaSection: () => null }));
vi.mock('@/components/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

async function renderAbout() {
  const { AboutPage } = await import('@/pages/AboutPage');
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>
  );
}

describe('AboutPage (owner 2026-11-22)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_IS_LIVE', 'true');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('should have one h1, in the first person, with the name and the contact address', async () => {
    const { container } = await renderAbout();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: ABOUT.whoTitle })).toBeTruthy();
    expect(ABOUT.whoTitle).toContain('Mannar Hielal');
    const mail = container.querySelector('a[href^="mailto:"]');
    expect(mail?.getAttribute('href')).toBe('mailto:info@cryptopapertrade.com');
    // Written in "I", never "we"
    expect(JSON.stringify(ABOUT)).not.toMatch(/\bwe\b|\bour\b/i);
  });

  it('should show the photo with its size, alt text and lazy loading', async () => {
    const { container } = await renderAbout();
    const img = container.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe(ABOUT.photoAlt);
    expect(img.getAttribute('width')).toBe('480');
    expect(img.getAttribute('height')).toBe('480');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('should stay out of search results and keep the paper-trading limits', async () => {
    await renderAbout();
    expect(screen.getByTestId('seo').getAttribute('data-noindex')).toBe('true');
    expect(screen.getByTestId('seo').getAttribute('data-path')).toBe('/about');
    expect(screen.getAllByText(/nothing here is financial advice/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/guaranteed|get rich|passive income/i)).toBeNull();
  });

  it('should send the visitor on to sign-up, the chart and How it works', async () => {
    const { container } = await renderAbout();
    for (const href of ['/register', '/chart', '/how-it-works'])
      expect(container.querySelector(`a[href="${href}"]`), href).not.toBeNull();
  });
});
