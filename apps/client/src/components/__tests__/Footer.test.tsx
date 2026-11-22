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

  it('should link the features page, the live chart and the blog when live', async () => {
    vi.stubEnv('VITE_IS_LIVE', 'true');
    const { container } = await renderFooter();
    for (const href of ['/features', '/chart', '/blog', '/terms', '/privacy']) {
      expect(container.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
  });

  it('should not link a chart before launch, when there is none to open (review 2026-11-22)', async () => {
    vi.stubEnv('VITE_IS_LIVE', 'false');
    const { container } = await renderFooter();
    expect(container.querySelector('a[href="/chart"]')).toBeNull();
    expect(container.querySelector('a[href="/features"]')).not.toBeNull();
  });

  it('should keep the plain footer on sign-in, register and the legal pages (review 2026-11-22)', async () => {
    vi.stubEnv('VITE_IS_LIVE', 'true');
    const { container } = await renderFooter(false);
    for (const href of ['/features', '/chart', '/blog']) {
      expect(container.querySelector(`a[href="${href}"]`), href).toBeNull();
    }
    expect(container.querySelector('a[href="/terms"]')).not.toBeNull();
  });
});
