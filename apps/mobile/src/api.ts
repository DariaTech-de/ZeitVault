// API-Client der Mobile-App. Auth-Header je Modus (Bearer bzw. x-*).
import { API_BASE, TENANT_ID } from './config';

export interface Session {
  mode: 'oidc' | 'dev';
  userId: string;
  roles: string[];
  accessToken?: string;
}

export interface MeResponse {
  tenantId: string;
  userId: string;
  roles: string[];
  employee: { id: string; displayName: string; personnelNumber: string } | null;
}

export interface TodayResponse {
  status: { state: 'out' | 'in' | 'break'; workedMinutes: number; breakMinutes: number };
  findings: Array<{ code: string; severity: 'warning' | 'violation'; message: string }>;
}

export function authHeaders(session: Session): Record<string, string> {
  const base: Record<string, string> = { 'content-type': 'application/json' };
  if (session.mode === 'oidc' && session.accessToken) {
    return { ...base, authorization: `Bearer ${session.accessToken}` };
  }
  return {
    ...base,
    'x-tenant-id': TENANT_ID,
    'x-user-id': session.userId,
    'x-roles': session.roles.join(','),
  };
}

export async function fetchMe(session: Session): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/api/me`, { headers: authHeaders(session) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as MeResponse;
}

export async function fetchToday(session: Session, employeeId: string): Promise<TodayResponse> {
  const res = await fetch(
    `${API_BASE}/api/stamp/today?employeeId=${encodeURIComponent(employeeId)}`,
    { headers: authHeaders(session) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as TodayResponse;
}

export async function syncStamps(
  session: Session,
  employeeId: string,
  items: ReadonlyArray<{ clientEventId: string; kind: string; occurredAt: string }>,
): Promise<{ accepted: number; duplicates: number }> {
  const res = await fetch(`${API_BASE}/api/stamp/sync`, {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({ employeeId, items }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as { accepted: number; duplicates: number };
}
