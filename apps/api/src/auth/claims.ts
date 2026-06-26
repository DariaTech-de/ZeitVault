import type { TenantContext } from '@zeitvault/types';

export interface ClaimsOptions {
  /** Name des Claims, der die tenant_id traegt (Default: 'tenant_id'). */
  tenantClaim: string;
  /** Fallback-Mandant (Self-Hosted: 'default'), falls kein Tenant-Claim vorhanden. */
  defaultTenantId: string;
}

interface RealmAccess {
  roles?: unknown;
}

/**
 * Leitet den TenantContext aus den verifizierten OIDC-Token-Claims ab (rein,
 * daher testbar). Rollen kommen aus Keycloaks `realm_access.roles`
 * (Kern-Invariante 3: Tenant-Kontext stammt aus dem Auth-Token).
 */
export function claimsToContext(
  payload: Record<string, unknown>,
  opts: ClaimsOptions,
): TenantContext {
  const sub = payload.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new Error('Token ohne gueltigen sub-Claim.');
  }

  const tenantRaw = payload[opts.tenantClaim];
  const tenantId =
    typeof tenantRaw === 'string' && tenantRaw.length > 0 ? tenantRaw : opts.defaultTenantId;

  const realmAccess = payload.realm_access as RealmAccess | undefined;
  const roles = Array.isArray(realmAccess?.roles)
    ? realmAccess.roles.filter((role): role is string => typeof role === 'string')
    : [];

  return { tenantId, userId: sub, roles };
}
