import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests need Postgres: they run with `pnpm test:int` (vitest.int.config.ts), not here
    // Stryker's sandbox (.stryker-tmp) is a copy of src — its tests must not run a second time
    exclude: [...configDefaults.exclude, 'src/**/*.int.test.ts', '.stryker-tmp/**'],
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
      // Entry points aren't unit-tested: the server's (index.ts) and the command-line tools' (the
      // fake feed's logic in tools/fakeBybit/{feed,server}.ts is, and stays counted)
      exclude: [
        'src/index.ts',
        'src/**/__tests__/**',
        'src/tools/*.ts',
        'src/tools/fakeBybit/main.ts',
      ],
      // Floors just under today's numbers (2026-09-28), raised as tests land — never lowered to
      // make a change pass. The engine is held higher: it is where the money maths lives.
      thresholds: {
        lines: 85,
        statements: 83,
        branches: 76,
        functions: 80,
        'src/trading/engine/**/*.ts': { lines: 97, statements: 94, branches: 85, functions: 96 },
      },
    },
  },
});
