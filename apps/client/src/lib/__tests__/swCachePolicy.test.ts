import { describe, expect, it } from 'vitest';
import { isCacheableAsset } from '@/lib/swCachePolicy';

const at = (href: string) => isCacheableAsset({ url: new URL(href, self.location.href) });

describe('the service worker’s runtime cache (review on #287)', () => {
  it('should cache the site’s own static assets', () => {
    expect(at('/assets/index-abc.js')).toBe(true);
    expect(at('/pwa-192x192.png')).toBe(true);
  });

  it('should never cache the API: another origin, its /health probe included', () => {
    expect(at('https://api.cryptopapertrade.com/health')).toBe(false);
    expect(at('https://api.cryptopapertrade.com/api/auth/refresh')).toBe(false);
  });

  it('should never cache a same-origin /api/ call, nor another site', () => {
    expect(at('/api/auth/refresh')).toBe(false);
    expect(at('https://example.com/logo.png')).toBe(false);
  });

  it('should stay self-contained, as Workbox writes it into the service worker as text', () => {
    const source = isCacheableAsset.toString();
    expect(source).not.toMatch(/\bimport\b|require\(/);
  });
});
