// Identitätsmodell der Web-App. Es gibt zwei Modi (parallel zur API):
//  - 'oidc'  : produktionssicher; Access-Token aus Keycloak (Authorization Code
//              + PKCE), als Bearer an die API gesendet (ADR-0008).
//  - 'dev'   : nur lokal/Sandbox ohne laufenden Keycloak; Tenant/User/Rolle aus
//              Headern, passend zur API im AUTH_MODE=dev.
// Der Modus wird über NEXT_PUBLIC_AUTH_MODE gesteuert.

export type AuthMode = 'oidc' | 'dev';

export interface Identity {
  mode: AuthMode;
  tenantId: string;
  userId: string;
  employeeId: string;
  roles: string[];
  accessToken?: string;
}

export const AUTH_MODE: AuthMode =
  (process.env.NEXT_PUBLIC_AUTH_MODE as AuthMode | undefined) ?? 'dev';

/**
 * Demo-Identität für den Dev-Modus. userId entspricht dem festen OIDC-Subject des
 * Keycloak-Demo-Nutzers, sodass /me denselben Mitarbeiter wie nach echtem Login
 * auflöst.
 */
const DEFAULT_DEV_IDENTITY: Identity = {
  mode: 'dev',
  tenantId: process.env.NEXT_PUBLIC_TENANT_ID ?? 'default',
  userId: process.env.NEXT_PUBLIC_USER_ID ?? '11111111-1111-1111-1111-111111111111',
  employeeId: process.env.NEXT_PUBLIC_EMPLOYEE_ID ?? '11111111-1111-1111-1111-111111111111',
  roles: ['employee'],
};

const STORAGE_KEY = 'zeitvault.identity';

/** Dev-Modus: Demo-Identität (clientseitig gehalten, rollenumschaltbar). */
export function getDevIdentity(): Identity {
  if (typeof window === 'undefined') return DEFAULT_DEV_IDENTITY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_DEV_IDENTITY, ...(JSON.parse(raw) as Partial<Identity>), mode: 'dev' };
    }
  } catch {
    // korrupten Speicher ignorieren
  }
  return DEFAULT_DEV_IDENTITY;
}

export function setDevIdentity(identity: Identity): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  }
}

/** Auth-Header je nach Modus: Bearer-Token (oidc) bzw. x-*-Header (dev). */
export function authHeaders(identity: Identity): Record<string, string> {
  const base: Record<string, string> = { 'content-type': 'application/json' };
  if (identity.mode === 'oidc' && identity.accessToken) {
    return { ...base, authorization: `Bearer ${identity.accessToken}` };
  }
  return {
    ...base,
    'x-tenant-id': identity.tenantId,
    'x-user-id': identity.userId,
    'x-roles': identity.roles.join(','),
  };
}
