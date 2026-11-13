/**
 * PWA readiness on the live site (2026-11-13, reports/pwa-readiness): the production build is the
 * only one with the service worker (`vite dev` doesn't register it), so these run in the
 * production smoke. Read-only: no sign-in, no writes.
 */

import { expect, test } from '@playwright/test';

interface Manifest {
  name: string;
  short_name: string;
  display: string;
  start_url: string;
  icons: { src: string; sizes: string; purpose?: string }[];
}

test('@prod the app is installable: a manifest with its name, standalone, and 192 and 512 icons', async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(new URL(href!, baseURL).toString());
  expect(res.status()).toBe(200);
  const manifest = (await res.json()) as Manifest;
  // Owner 2026-11-13: the home-screen name
  expect(manifest.short_name).toBe('CryptoPaperTrade');
  expect(manifest.name).toBe('Crypto Paper Trade');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of manifest.icons.filter((i) => ['192x192', '512x512'].includes(i.sizes))) {
    const img = await request.get(new URL(icon.src, baseURL).toString());
    expect(img.status(), icon.src).toBe(200);
    expect(img.headers()['content-type'], icon.src).toContain('image/png');
  }
  // iOS reads its own tag for the home-screen name
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    'content',
    'CryptoPaperTrade'
  );
});

test('@prod the service worker takes over, and an offline reload still opens the app', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  // Registered and active (vite-plugin-pwa, autoUpdate)
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg?.active;
  });
  // A reload puts the page under the worker's control, so the app shell is served from its cache
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  try {
    await page.reload();
    // The shell renders (no browser error page, no blank screen) and says it's offline
    await expect(page).toHaveTitle(/cryptopapertrade/i);
    await expect(page.getByRole('alert').filter({ hasText: /Offline/ })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
  expect(errors).toEqual([]);
});
