// One ESLint config for the whole monorepo. Each package's `lint` script runs ESLint (style and bug rules)
// and then `tsc` with the unused-code checks switched on.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/node_modules/', '**/dist/', '**/out/', '**/.expo/', 'firmware/.pio/', '**/.next/', '**/next-env.d.ts',
    '**/playwright-report/', '**/test-results/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs', '**/*.js', '**/*.cjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // SPEC 0.7: no `any` except at clearly commented library boundaries (use an eslint-disable comment there).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }], // `x != null` is our idiom for "not null or undefined"
      'prefer-const': 'error',
    },
  },
  {
    // Edge functions run in Deno (`Deno` global); they are linted by `deno lint` (supabase/package.json).
    files: ['supabase/functions/**/*.ts'],
    languageOptions: { globals: { Deno: 'readonly' } },
  },
  {
    // Expo loads config plugins and metro.config.js with Node's CommonJS require(), so they must use require() themselves.
    files: ['apps/mobile/plugins/**/*.js', 'apps/mobile/metro.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
