import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests need Postgres: they run with `pnpm test:int` (vitest.int.config.ts), not here
    exclude: [...configDefaults.exclude, 'src/**/*.int.test.ts'],
    // These env vars are injected BEFORE any test module loads,
    // so config.ts won't call process.exit(1) for missing vars
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/crypto_dashboard_test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-only-secret-min-32-chars-not-for-production',
      BYBIT_API_KEY: 'test-key',
      BYBIT_API_SECRET: 'test-secret',
      ADMIN_EMAIL: 'admin@test.com',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/__tests__/**'],
      // Floors just under today's numbers (2026-09-28), raised as tests land — never lowered to
      // make a change pass. The engine is held higher: it is where the money maths lives.
      thresholds: {
        lines: 82,
        statements: 80,
        branches: 75,
        functions: 76,
        'src/trading/engine/**/*.ts': { lines: 97, statements: 94, branches: 85, functions: 96 },
      },
    },
  },
});
