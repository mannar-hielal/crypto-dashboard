import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  define: {
    'import.meta.env.VITE_ADMIN_EMAIL': '"admin@example.com"',
  },
  test: {
    // jsdom provides localStorage, sessionStorage and other browser globals
    // needed by Zustand's persist middleware (paperStore) and future DOM tests.
    environment: 'jsdom',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      // The forked drawing library is third-party code, not measured before the fork (it was in
      // node_modules) — excluded so the floors keep measuring our own code
      exclude: ['src/main.tsx', 'src/**/__tests__/**', 'src/vendor/**'],
      // Floors just under today's numbers (2026-09-28, after both M1 PRs), raised as
      // tests land — never lowered
      thresholds: { lines: 51, statements: 50, branches: 54, functions: 50 },
    },
  },
  resolve: {
    alias: {
      // Mirror the @/ path alias from tsconfig.app.json so imports resolve in tests
      '@': resolve(__dirname, './src'),
      // Forked library — mirrors the vite.config.ts / tsconfig alias
      'lightweight-charts-drawing': resolve(
        __dirname,
        './src/vendor/lightweight-charts-drawing/index.ts'
      ),
    },
  },
});
