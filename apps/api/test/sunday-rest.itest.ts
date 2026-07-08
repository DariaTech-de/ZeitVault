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

// B-06: Ersatzruhetag-Tracking mit Fristueberwachung ueber den
// Jahres-Report (sundayRestReport).
const stamp = Date.now();
const TENANT = `itest-sun-${stamp}`;

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

async function employee(): Promise<string> {
  const emp = await withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into employees (tenant_id, personnel_number, display_name)
       values ($1, 'SN-${Math.floor(Math.random() * 1e9)}', 'Sonntag Probe') returning id`,
      [TENANT],
    ),
  );
  return emp.rows[0].id;
}

async function workedEveryDay(employeeId: string, from: string, to: string): Promise<void> {
  const values: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    const d = cursor.toISOString().slice(0, 10);
    values.push(`('${TENANT}', '${employeeId}', 'clock_in',  '${d}T06:00:00Z', 'web')`);
    values.push(`('${TENANT}', '${employeeId}', 'clock_out', '${d}T12:00:00Z', 'web')`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  await withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into stamp_events (tenant_id, employee_id, kind, occurred_at, source)
       values ${values.join(',')}`,
    ),
  );
}

describe('B-06: Sonntagsarbeit und Ersatzruhetag', () => {
  it('Sonntagsarbeit ohne freien Werktag bis Fristablauf: Verstoss im Jahres-Report', async () => {
    const emp = await employee();
    // So 07.06.2026 gearbeitet und danach JEDEN Tag bis nach der Frist (21.06.).
    await workedEveryDay(emp, '2026-06-07', '2026-06-25');
    const entries = await asTenant(() => reporting.sundayRestReport(2026));
    const mine = entries.filter((e) => e.employeeId === emp);
    const codes = mine.flatMap((e) => e.findings.map((f) => f.code));
    expect(codes).toContain('SUNDAY_COMPENSATION_MISSING');
    expect(mine.find((e) => e.findings[0]?.code === 'SUNDAY_COMPENSATION_MISSING')?.date).toBe(
      '2026-06-07',
    );
  });

  it('Sonntagsarbeit mit beschaeftigungsfreiem Werktag in der Frist: kein Verstoss', async () => {
    const emp = await employee();
    // Nur der Sonntag 07.06. gearbeitet - der Montag danach ist frei.
    await workedEveryDay(emp, '2026-06-07', '2026-06-07');
    const entries = await asTenant(() => reporting.sundayRestReport(2026));
    const codes = entries
      .filter((e) => e.employeeId === emp)
      .flatMap((e) => e.findings.map((f) => f.code));
    expect(codes).not.toContain('SUNDAY_COMPENSATION_MISSING');
    expect(codes).not.toContain('SUNDAY_COMPENSATION_PENDING');
  });
});
