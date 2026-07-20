import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import securityPlugin from 'eslint-plugin-security';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**', // compiled build output — never lint generated JS/d.ts
      '**/.next/**',
      '**/build/**',
      '**/.turbo/**',
      'pnpm-lock.yaml',
      'apps/server/generated/**', // 🔐 never lint auto-generated Prisma client
      'generated/**', // 🔐 never lint workspace-root generated/ (CDSDK)
      'tv-website-full/**', // TradingView captured bundles — reference only
      '**/*.har', // HTTP archive files — reference only, not source code
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  securityPlugin.configs.recommended,
  // Base rules for all files (no type information needed)
  {
    rules: {
      'no-unused-vars': 'off', // handled by TypeScript compiler
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'error', // 🔐 any defeats TypeScript safety
      eqeqeq: ['error', 'always'], // 🔐 always === never ==
    },
  },
  // Typed rules — only for server source files (requires tsconfig)
  // tsconfig.eslint.json extends the base but includes test files too,
  // so ESLint can resolve types for __tests__/**  without polluting the build output.
  {
    files: ['apps/server/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./apps/server/tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error', // 🔐 unhandled promises = silent crashes
    },
  },
];
