import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // These env vars are injected BEFORE any test module loads,
    // so config.ts won't call process.exit(1) for missing vars
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/crypto_dashboard_test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-only-secret-min-32-chars-not-for-production',
      BYBIT_API_KEY: 'test-key',
      BYBIT_API_SECRET: 'test-secret',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/__tests__/**'],
    },
  },
});
