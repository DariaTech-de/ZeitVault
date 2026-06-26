// Demo-Identitaet fuer das lokale Geruest. Im Zielbild stammt dies aus dem
// verifizierten OIDC-Token (ADR-0008); hier wird Tenant/User/Rolle clientseitig
// gehalten, damit die rollenabhaengige UI ohne laufenden Keycloak demonstrierbar
// ist. Die API laeuft dafuer im AUTH_MODE=dev.

export interface Identity {
  tenantId: string;
  userId: string;
  employeeId: string;
  roles: string[];
}

const DEFAULT_IDENTITY: Identity = {
  tenantId: process.env.NEXT_PUBLIC_TENANT_ID ?? 'default',
  userId: process.env.NEXT_PUBLIC_USER_ID ?? '00000000-0000-0000-0000-000000000001',
  employeeId: process.env.NEXT_PUBLIC_EMPLOYEE_ID ?? '00000000-0000-0000-0000-000000000001',
  roles: ['employee'],
};

const STORAGE_KEY = 'zeitvault.identity';

export function getIdentity(): Identity {
  if (typeof window === 'undefined') return DEFAULT_IDENTITY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_IDENTITY, ...(JSON.parse(raw) as Partial<Identity>) };
    }
  } catch {
    // ignore corrupt storage
  }
  return DEFAULT_IDENTITY;
}

export function setIdentity(identity: Identity): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  }
}

export function authHeaders(identity: Identity): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-tenant-id': identity.tenantId,
    'x-user-id': identity.userId,
    'x-roles': identity.roles.join(','),
  };
}
