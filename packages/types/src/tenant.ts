import { z } from 'zod';

/**
 * Self-Hosted laeuft als genau ein Mandant mit dieser tenant_id; RLS bleibt
 * aktiv (siehe ADR-0004, ARCHITEKTUR.md Paragraf 7).
 */
export const DEFAULT_TENANT_ID = 'default';

/**
 * Pro Request gesetzter Tenant-Kontext. Wird aus dem Auth-Token abgeleitet
 * (OIDC/SAML via Keycloak) und ueber `SET LOCAL` an die DB-Transaktion
 * gebunden. Kein Datenzugriff ohne gueltigen Kontext (Kern-Invariante 3).
 */
export const tenantContextSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  roles: z.array(z.string()).default([]),
});
export type TenantContext = z.infer<typeof tenantContextSchema>;
