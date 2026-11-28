import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: to, ...props }, children),
}));
vi.mock('@/components/TrustBadges', () => ({ TrustBadges: () => null }));

async function renderFooter(marketing = true) {
  const { Footer } = await import('@/components/Footer');
  return render(React.createElement(Footer, { marketing }));
}

describe('Footer', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('should link the How it works page, the live chart and the blog when live', async () => {
    vi.stubEnv('VITE_IS_LIVE', 'true');
    const { container } = await renderFooter();
    for (const href of ['/how-it-works', '/chart', '/blog', '/terms', '/privacy']) {
      expect(container.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
  });

  it('should not link a chart before launch, when there is none to open (review 2026-11-22)', async () => {
    vi.stubEnv('VITE_IS_LIVE', 'false');
    const { container } = await renderFooter();
    expect(container.querySelector('a[href="/chart"]')).toBeNull();
    expect(container.querySelector('a[href="/how-it-works"]')).not.toBeNull();
  });

  it('should link the tip section of the About page, before launch too (owner 2026-11-28)', async () => {
    vi.stubEnv('VITE_IS_LIVE', 'false');
    const { container } = await renderFooter();
    expect(container.querySelector('a[href="/about#tip"]')?.textContent).toBe('Support the app');
  });

  it('should keep the plain footer on sign-in, register and the legal pages (review 2026-11-22)', async () => {
    vi.stubEnv('VITE_IS_LIVE', 'true');
    const { container } = await renderFooter(false);
    for (const href of ['/how-it-works', '/chart', '/blog', '/about#tip']) {
      expect(container.querySelector(`a[href="${href}"]`), href).toBeNull();
    }
    expect(container.querySelector('a[href="/terms"]')).not.toBeNull();
  });
});
