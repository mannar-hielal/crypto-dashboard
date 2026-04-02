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
            'no-unused-vars': 'warn',
            'no-console': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
];
