import { z } from 'zod';

/** Validierte Umgebungskonfiguration. Faellt fail-fast bei ungueltigen Werten. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://zeitvault:zeitvault@localhost:5432/zeitvault'),
  LEDGER_URL: z.string().url().default('http://localhost:3001'),
  KEYCLOAK_ISSUER_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
