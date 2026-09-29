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

/**
 * The API server's environment for an e2e run: the fake feed, the test hooks, no real email. Shared
 * by playwright.config.ts (the main server) and restartableServer.ts (a second one of its own).
 */
export function apiEnv(port: number, databaseUrl: string): Record<string, string> {
  return {
    NODE_ENV: 'development',
    PORT: String(port),
    DATABASE_URL: databaseUrl,
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
  };
}
