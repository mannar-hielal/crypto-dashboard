/**
 * Playwright (docs/TEST_IMPLEMENTATION_PLAN.md F4): the app on the fake Bybit feed with the test
 * hooks, one seeded user per test. `pnpm --filter @crypto-dashboard/e2e test:smoke` locally (needs a
 * Postgres: E2E_DATABASE_URL, default localhost:5432/crypto_dashboard_e2e_test).
 */

import { defineConfig, devices } from '@playwright/test';
import { API_PORT, API_URL, DATABASE_URL, FEED_PORT, HOOKS_SECRET, WEB_PORT, WEB_URL } from './env';

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
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit',
      grep: /@smoke|@full/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile-safari', grep: /@mobile/, use: { ...devices['iPhone 14'] } },
    { name: 'mobile-chrome', grep: /@mobile/, use: { ...devices['Pixel 7'] } },
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
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        DATABASE_URL,
        REDIS_URL: 'redis://localhost:6379',
        BYBIT_API_KEY: 'e2e-unused',
        BYBIT_API_SECRET: 'e2e-unused',
        BYBIT_TESTNET: 'false',
        JWT_SECRET: 'e2e-only-jwt-secret-of-at-least-32-bytes',
        ADMIN_EMAIL: 'admin@test.local',
        CLIENT_URL: WEB_URL,
        CORS_ORIGIN: WEB_URL,
        LOG_LEVEL: 'warn',
        BYBIT_REST_URL: `http://127.0.0.1:${FEED_PORT}`,
        BYBIT_WS_URL: `ws://127.0.0.1:${FEED_PORT}`,
        // 🔐 Set (empty) so dotenv can't load a developer's real key from apps/server/.env; the
        // server also refuses to mail anyone with the test hooks on (EmailService)
        RESEND_API_KEY: '',
        ENABLE_TEST_HOOKS: '1',
        TEST_HOOKS_SECRET: HOOKS_SECRET,
      },
    },
    {
      name: 'web',
      command: `pnpm --filter @crypto-dashboard/client exec vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: { VITE_API_URL: API_URL },
    },
  ],
});
