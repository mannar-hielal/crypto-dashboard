import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  define: {
    'import.meta.env.VITE_ADMIN_EMAIL': '"adminwithu@gmail.com"',
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
      exclude: ['src/main.tsx', 'src/**/__tests__/**'],
      // Floors just under today's numbers (2026-09-28, after both M1 PRs), raised as
      // tests land — never lowered
      thresholds: { lines: 51, statements: 50, branches: 54, functions: 50 },
    },
  },
  resolve: {
    alias: {
      // Mirror the @/ path alias from tsconfig.app.json so imports resolve in tests
      '@': resolve(__dirname, './src'),
    },
  },
});
