import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
    {
        ignores: ['node_modules', 'dist', '.next', 'build', '.turbo', 'pnpm-lock.yaml'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            'no-unused-vars': 'off', // handled by TypeScript compiler
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-console': 'warn',    // warn not error — we'll replace with pino logger later
            '@typescript-eslint/no-explicit-any': 'error', // 🔐 any defeats TypeScript's safety
            '@typescript-eslint/no-floating-promises': 'error', // 🔐 unhandled promises = silent crashes
            'eqeqeq': ['error', 'always'], // 🔐 always === never ==
        },
    },
];
