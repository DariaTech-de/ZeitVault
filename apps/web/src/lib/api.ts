// API-Client fuer apps/api. Im Scaffold werden Tenant/User als Header gesendet;
// im Zielbild stammt der Kontext aus dem verifizierten OIDC-Token (ADR-0008).

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';
const USER_ID = process.env.NEXT_PUBLIC_USER_ID ?? '00000000-0000-0000-0000-000000000001';

export type StampState = 'out' | 'in' | 'break';
export type FindingSeverity = 'warning' | 'violation';
export type StampAction = 'clock-in' | 'break-start' | 'break-end' | 'clock-out';

export interface Finding {
  code: string;
  severity: FindingSeverity;
  message: string;
}

export interface StampStatus {
  state: StampState;
  workedMinutes: number;
  breakMinutes: number;
}

export interface TodayResponse {
  status: StampStatus;
  findings: Finding[];
}

function headers(): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-tenant-id': TENANT_ID,
    'x-user-id': USER_ID,
  };
}

export async function fetchToday(employeeId: string): Promise<TodayResponse> {
  const url = `${API_BASE}/api/stamp/today?employeeId=${encodeURIComponent(employeeId)}`;
  const res = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<TodayResponse>;
}

export async function stamp(action: StampAction, employeeId: string): Promise<TodayResponse> {
  const res = await fetch(`${API_BASE}/api/stamp/${action}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ employeeId, source: 'web' }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return res.json() as Promise<TodayResponse>;
}
