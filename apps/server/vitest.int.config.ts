import { defineConfig } from 'vitest/config';

/**
 * Integration tests (T2i in docs/TRADING_TEST_PLAN.md): a real Postgres, migrated from empty.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crypto_dashboard_int \
 *     pnpm --filter @crypto-dashboard/server test:int
 *
 * globalSetup migrates it (`prisma migrate deploy`); the tests delete the rows they reach, so 🔐 its
 * name must end in `_int` or `_test` (anything else is refused). Files run one at a time.
 */
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/crypto_dashboard_int';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['src/__tests__/int/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-only-secret-min-32-chars-not-for-production',
      BYBIT_API_KEY: 'test-key',
      BYBIT_API_SECRET: 'test-secret',
      ADMIN_EMAIL: 'admin@test.com',
    },
  },
});
