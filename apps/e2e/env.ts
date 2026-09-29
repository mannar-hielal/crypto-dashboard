/**
 * The e2e environment (docs/TEST_IMPLEMENTATION_PLAN.md F4): ports, the throwaway database and the
 * test-hooks secret, shared by playwright.config.ts, the global setup and the fixtures.
 */

export const FEED_PORT = Number(process.env.E2E_FEED_PORT ?? 4010);
export const API_PORT = Number(process.env.E2E_API_PORT ?? 3001);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);

export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const FEED_URL = `http://127.0.0.1:${FEED_PORT}`;

/** 🔐 A throwaway database: its name must end in _test (the global setup refuses anything else) */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/crypto_dashboard_e2e_test';

/**
 * The test hooks' shared secret — test-only, generated per run unless given. Set on the environment
 * the first time (the config's process), so the workers Playwright spawns inherit the same value.
 */
process.env.TEST_HOOKS_SECRET ??= `e2e-${process.pid}-${Date.now()}-hooks`;
export const HOOKS_SECRET = process.env.TEST_HOOKS_SECRET;
