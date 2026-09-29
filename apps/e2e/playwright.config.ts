/**
 * Playwright (docs/TEST_IMPLEMENTATION_PLAN.md F4): the app on the fake Bybit feed with the test
 * hooks, one seeded user per test. `pnpm --filter @crypto-dashboard/e2e test:smoke` locally (needs a
 * Postgres: E2E_DATABASE_URL, default localhost:5432/crypto_dashboard_e2e_test).
 */

import { defineConfig, devices } from '@playwright/test';
import { API_PORT, API_URL, DATABASE_URL, FEED_PORT, WEB_PORT, WEB_URL, apiEnv } from './env';

const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // PRs run `chromium` with @smoke; the nightly runs every project (e2e-nightly.yml)
  projects: [
    {
      name: 'chromium',
      grepInvert: /@resilience/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // One project at a time: the fake feed's prices are global per market, and each spec owns its
    // markets (helpers.ts) — two browsers running the same spec at once would move them under each other
    {
      name: 'webkit',
      dependencies: ['chromium'],
      grep: /@smoke|@full/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-safari',
      dependencies: ['webkit'],
      grep: /@mobile/,
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'mobile-chrome',
      dependencies: ['mobile-safari'],
      grep: /@mobile/,
      use: { ...devices['Pixel 7'] },
    },
    // A second API server of its own, crashed and restarted (restartableServer.ts): last, alone
    {
      name: 'resilience',
      dependencies: ['mobile-chrome'],
      grep: /@resilience/,
    },
  ],
  webServer: [
    {
      name: 'fake-bybit',
      command: 'pnpm --filter @crypto-dashboard/server fake-bybit',
      url: `http://127.0.0.1:${FEED_PORT}/v5/market/instruments-info?category=spot&symbol=BTCUSDT`,
      env: { FAKE_BYBIT_PORT: String(FEED_PORT) },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      name: 'api',
      command: 'node scripts/startServer.mjs',
      url: `${API_URL}/health`,
      reuseExistingServer: !CI,
      timeout: 180_000,
      env: apiEnv(API_PORT, DATABASE_URL),
    },
    {
      name: 'web',
      command: `pnpm --filter @crypto-dashboard/client exec vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: !CI,
      timeout: 120_000,
      // VITE_E2E: the read-only chart probe (apps/client/src/lib/e2eProbe.ts)
      env: { VITE_API_URL: API_URL, VITE_E2E: '1' },
    },
  ],
});
