import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
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
    },
  },
  resolve: {
    alias: {
      // Mirror the @/ path alias from tsconfig.app.json so imports resolve in tests
      '@': resolve(__dirname, './src'),
    },
  },
});
