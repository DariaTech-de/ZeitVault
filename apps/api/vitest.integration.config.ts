import { defineConfig } from 'vitest/config';

// Integrationstests gegen ein echtes Postgres (DATABASE_URL). Getrennt von den
// Unit-Tests (`*.test.ts`), da sie eine Datenbank benoetigen.
export default defineConfig({
  test: {
    include: ['test/**/*.itest.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
