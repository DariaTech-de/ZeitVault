import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { ReportingService } from '../src/reporting/reporting.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// B-01: 10-h-Tage ohne Ausgleich verletzen den werktaeglichen 8-h-Durchschnitt
// im Ausgleichszeitraum. B-04: Nachtarbeitnehmer werden ueber die KUERZERE
// Periode gemessen - derselbe Juni kippt fuer sie, waehrend das 6-Monats-
// Fenster normaler Mitarbeitender ihn ausgleicht.
const stamp = Date.now();
const TENANT = `itest-avg-${stamp}`;

let pool: Pool;
let reporting: ReportingService;
let tenantContext: TenantContextService;

const auditStub = { append: async () => undefined } as unknown as AuditClient;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
  const db = drizzle(pool, { schema }) as unknown as Database;
  tenantContext = new TenantContextService();
  const workLocations = new WorkLocationService(db, tenantContext, auditStub);
  const resolution = new RuleResolutionService(db, tenantContext);
  reporting = new ReportingService(db, tenantContext, workLocations, resolution);

  await asTenant(() =>
    workLocations.create({
      name: 'Werk Muenchen',
      countryCode: 'DE',
      stateCode: 'BY',
      timeZone: 'Europe/Berlin',
      isDefault: true,
    }),
  );
});

afterAll(async () => {
  await pool.end();
});

function asTenant<T>(fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId: TENANT, userId: 'itest', roles: ['admin'] }, fn);
}

async function employee(nightWorker: boolean): Promise<string> {
  const emp = await withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into employees (tenant_id, personnel_number, display_name, night_worker)
       values ($1, 'AV-${Math.floor(Math.random() * 1e9)}', 'Durchschnitt Probe', $2) returning id`,
      [TENANT, nightWorker],
    ),
  );
  return emp.rows[0].id;
}

/** 10-h-Schichten (06:00-16:00 UTC) an allen Mo-Fr in [from, to], als Bulk-Insert. */
async function tenHourWeekdays(employeeId: string, from: string, to: string): Promise<void> {
  const values: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    const dow = cursor.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      const d = cursor.toISOString().slice(0, 10);
      values.push(`('${TENANT}', '${employeeId}', 'clock_in',  '${d}T06:00:00Z', 'web')`);
      values.push(`('${TENANT}', '${employeeId}', 'clock_out', '${d}T16:00:00Z', 'web')`);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  await withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into stamp_events (tenant_id, employee_id, kind, occurred_at, source)
       values ${values.join(',')}`,
    ),
  );
}

describe('B-01/B-04: werktaeglicher 8-h-Durchschnitt im Ausgleichszeitraum', () => {
  it('AK B-01: 10-h-Tage ueber den ganzen Zeitraum ohne Ausgleich -> Verstoss', async () => {
    const emp = await employee(false);
    await tenHourWeekdays(emp, '2026-01-01', '2026-06-30');
    const entries = await asTenant(() => reporting.workingTimeAverages('2026-06-30'));
    const entry = entries.find((e) => e.employeeId === emp);
    expect(entry).toBeDefined();
    expect(entry?.findings.map((f) => f.code)).toContain('AVERAGING_LIMIT_EXCEEDED');
  });

  it('AK B-04: nur der Juni ist ueberzogen - Nachtarbeitnehmer (1 Monat) kippt, normale Mitarbeitende (6 Monate) nicht', async () => {
    const normal = await employee(false);
    const night = await employee(true);
    await tenHourWeekdays(normal, '2026-06-01', '2026-06-30');
    await tenHourWeekdays(night, '2026-06-01', '2026-06-30');

    const entries = await asTenant(() => reporting.workingTimeAverages('2026-06-30'));
    expect(entries.find((e) => e.employeeId === normal)).toBeUndefined();
    const nightEntry = entries.find((e) => e.employeeId === night);
    expect(nightEntry).toBeDefined();
    expect(nightEntry?.nightWorker).toBe(true);
    expect(nightEntry?.findings.map((f) => f.code)).toContain('AVERAGING_LIMIT_EXCEEDED');
  });
});
