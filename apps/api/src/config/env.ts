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
  // Authentifizierung: 'oidc' (Default, produktionssicher: Bearer-Token gegen
  // Keycloak-JWKS) oder 'dev' (nur lokal/Tests: Tenant/User aus Headern).
  AUTH_MODE: z.enum(['oidc', 'dev']).default('oidc'),
  KEYCLOAK_ISSUER_URL: z.string().url().optional(),
  KEYCLOAK_AUDIENCE: z.string().optional(),
  TENANT_CLAIM: z.string().default('tenant_id'),
  DEFAULT_TENANT_ID: z.string().default('default'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
