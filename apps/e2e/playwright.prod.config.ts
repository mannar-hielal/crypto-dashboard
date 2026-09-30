/**
 * Production smoke (T5, docs/TRADING_TEST_PLAN.md roadmap P5): read-only checks against the live site —
 * after every deploy (deploy.yml) and hourly (prod-smoke.yml). No web servers, no sign-in, no writes.
 *
 *   pnpm --filter @crypto-dashboard/e2e test:prod
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests-prod',
  retries: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PROD_WEB_URL ?? 'https://cryptopapertrade.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'prod', use: { ...devices['Desktop Chrome'] } }],
});
