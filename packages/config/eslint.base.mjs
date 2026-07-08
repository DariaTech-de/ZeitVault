// Geteilte ESLint-Flat-Config-Basis fuer ZeitVault.
// Wird von der Root-Datis eslint.config.mjs eingebunden.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.config.{js,cjs,mjs}',
      '**/next-env.d.ts',
      // Eigenstaendiges Electron-Paket (CommonJS, kein Workspace-Mitglied).
      'apps/kiosk/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // NestJS-Apps: Konstruktor-Injection braucht Laufzeit-Imports der Typen
    // (emitDecoratorMetadata). `import type` wuerde die DI brechen.
    files: ['apps/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  prettier,
];
