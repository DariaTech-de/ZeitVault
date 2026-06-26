import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle-Kit-Konfiguration (ADR-0005). Generierte Migrationen landen neben den
 * hand-gepflegten SQL-Migrationen mit RLS/Trigger (siehe src/db/migrations).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://zeitvault:zeitvault@localhost:5432/zeitvault',
  },
});
