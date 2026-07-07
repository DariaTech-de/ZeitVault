// API-Client fuer apps/api. Auth-Header stammen aus der (Demo-)Identitaet;
// im Zielbild ein OIDC-Bearer-Token (ADR-0008).
import { type Identity, authHeaders } from './identity';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

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

export interface DayEvent {
  id: string;
  kind: string;
  occurredAt: string;
  correctsEventId: string | null;
  correctionReason: string | null;
}

export interface DayListing {
  events: DayEvent[];
  status: StampStatus;
  findings: Finding[];
}

export interface EmployeeSummary {
  id: string;
  personnelNumber: string;
  displayName: string;
}

async function request<T>(identity: Identity, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(identity), ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export interface MeResponse {
  tenantId: string;
  userId: string;
  roles: string[];
  employee: { id: string; displayName: string; personnelNumber: string } | null;
}

/** Profil/Kontext des angemeldeten Nutzers (mit fertigen Auth-Headern). */
export async function fetchMe(headers: Record<string, string>): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/api/me`, { headers, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<MeResponse>;
}

export function fetchToday(identity: Identity): Promise<TodayResponse> {
  return request(identity, `/api/stamp/today?employeeId=${encodeURIComponent(identity.employeeId)}`);
}

export function stamp(identity: Identity, action: StampAction): Promise<TodayResponse> {
  return request(identity, `/api/stamp/${action}`, {
    method: 'POST',
    body: JSON.stringify({ employeeId: identity.employeeId, source: 'web' }),
  });
}

export function fetchEmployees(identity: Identity): Promise<EmployeeSummary[]> {
  return request(identity, '/api/admin/employees');
}

export function fetchDayEvents(identity: Identity, employeeId: string): Promise<DayListing> {
  return request(identity, `/api/stamp/events?employeeId=${encodeURIComponent(employeeId)}`);
}

export function postCorrection(
  identity: Identity,
  eventId: string,
  occurredAt: string,
  correctionReason: string,
): Promise<unknown> {
  return request(identity, '/api/stamp/corrections', {
    method: 'POST',
    body: JSON.stringify({ eventId, occurredAt, correctionReason }),
  });
}

export type AbsenceType = 'vacation' | 'sick' | 'special';
export type AbsenceStatus = 'requested' | 'approved' | 'rejected' | 'cancelled';
export type AbsenceAction = 'approve' | 'reject' | 'cancel';

export interface AbsenceRequest {
  id: string;
  employeeId: string;
  type: AbsenceType;
  fromDate: string;
  toDate: string;
  status: AbsenceStatus;
  reason: string | null;
  approverId: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export function fetchAbsences(identity: Identity, employeeId?: string): Promise<AbsenceRequest[]> {
  const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
  return request(identity, `/api/absences${query}`);
}

export function createAbsence(
  identity: Identity,
  input: { type: AbsenceType; from: string; to: string; reason?: string },
): Promise<AbsenceRequest> {
  return request(identity, '/api/absences', {
    method: 'POST',
    body: JSON.stringify({ employeeId: identity.employeeId, ...input }),
  });
}

export function decideAbsence(
  identity: Identity,
  id: string,
  action: AbsenceAction,
): Promise<AbsenceRequest> {
  return request(identity, `/api/absences/${id}/${action}`, { method: 'POST' });
}

export type AccountKind = 'overtime' | 'flextime' | 'vacation';

export interface AccountBalance {
  account: AccountKind;
  balance: number;
}

export interface StatementLine {
  account: AccountKind;
  amount: number;
  effectiveDate: string;
  reason?: string;
  runningBalance: number;
}

export function fetchBalances(identity: Identity, employeeId: string): Promise<AccountBalance[]> {
  return request(identity, `/api/accounts/balances?employeeId=${encodeURIComponent(employeeId)}`);
}

export function fetchStatement(identity: Identity, employeeId: string): Promise<StatementLine[]> {
  return request(identity, `/api/accounts/statement?employeeId=${encodeURIComponent(employeeId)}`);
}

export function postAccountTransaction(
  identity: Identity,
  input: { employeeId: string; account: AccountKind; amount: number; effectiveDate: string; reason?: string },
): Promise<unknown> {
  return request(identity, '/api/accounts/transactions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type CorrectionKind = 'add' | 'correct';
export type CorrectionStatus = 'requested' | 'approved' | 'rejected';

export interface CorrectionRequest {
  id: string;
  employeeId: string;
  kind: CorrectionKind;
  targetEventId: string | null;
  proposedKind: string;
  proposedOccurredAt: string;
  reason: string;
  status: CorrectionStatus;
  note: string | null;
  createdAt: string;
}

export function fetchCorrections(identity: Identity, employeeId?: string): Promise<CorrectionRequest[]> {
  const q = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
  return request(identity, `/api/corrections${q}`);
}

export function createCorrectionRequest(
  identity: Identity,
  input: { employeeId: string; proposedKind: string; proposedOccurredAt: string; reason: string },
): Promise<CorrectionRequest> {
  return request(identity, '/api/corrections', {
    method: 'POST',
    body: JSON.stringify({ ...input, kind: 'add' }),
  });
}

export function decideCorrection(
  identity: Identity,
  id: string,
  action: 'approve' | 'reject',
): Promise<CorrectionRequest> {
  return request(identity, `/api/corrections/${id}/${action}`, { method: 'POST' });
}

export interface LicenseStatus {
  licensed: boolean;
  valid: boolean;
  tier: string;
  customer: string | null;
  seats: number;
  seatsUsed: number;
  seatsRemaining: number;
  validUntil: string | null;
  reason: string;
}

export function fetchLicenseStatus(identity: Identity): Promise<LicenseStatus> {
  return request(identity, '/api/license');
}

export function activateLicense(identity: Identity, token: string): Promise<LicenseStatus> {
  return request(identity, '/api/license', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function createEmployee(
  identity: Identity,
  input: { personnelNumber: string; displayName: string; externalId?: string },
): Promise<EmployeeSummary> {
  return request(identity, '/api/admin/employees', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type LocationCheck = 'not_required' | 'inside' | 'outside' | 'no_signal';

export interface GeofenceSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  active: boolean;
}

export interface GeofenceReviewStamp {
  eventId: string;
  employeeId: string;
  kind: string;
  occurredAt: string;
  locationCheck: LocationCheck;
  distanceM: number | null;
  siteName: string | null;
  flagged: boolean;
  flagReason: string | null;
}

export function fetchGeofenceSettings(identity: Identity): Promise<{ enabled: boolean }> {
  return request(identity, '/api/geofence/settings');
}

export function setGeofenceEnabled(identity: Identity, enabled: boolean): Promise<{ enabled: boolean }> {
  return request(identity, '/api/geofence/settings', { method: 'PUT', body: JSON.stringify({ enabled }) });
}

export function fetchGeofenceSites(identity: Identity): Promise<GeofenceSite[]> {
  return request(identity, '/api/geofence/sites');
}

export function createGeofenceSite(
  identity: Identity,
  input: { name: string; latitude: number; longitude: number; radiusMeters: number },
): Promise<GeofenceSite> {
  return request(identity, '/api/geofence/sites', { method: 'POST', body: JSON.stringify(input) });
}

export function deactivateGeofenceSite(identity: Identity, id: string): Promise<{ ok: true }> {
  return request(identity, `/api/geofence/sites/${id}`, { method: 'DELETE' });
}

export function fetchGeofenceReview(identity: Identity): Promise<GeofenceReviewStamp[]> {
  return request(identity, '/api/geofence/review');
}

export function flagStamp(
  identity: Identity,
  input: { eventId: string; flagged: boolean; reason?: string },
): Promise<{ ok: true }> {
  return request(identity, '/api/geofence/flags', { method: 'POST', body: JSON.stringify(input) });
}

export interface ViolationEntry {
  employeeId: string;
  displayName: string;
  date: string;
  findings: Finding[];
}

export interface BalanceListEntry {
  employeeId: string;
  displayName: string;
  balances: AccountBalance[];
}

export function fetchViolations(
  identity: Identity,
  from: string,
  to: string,
): Promise<ViolationEntry[]> {
  return request(
    identity,
    `/api/reports/violations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export function fetchBalanceList(identity: Identity): Promise<BalanceListEntry[]> {
  return request(identity, '/api/reports/balances');
}
