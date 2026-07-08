import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { GeofenceService } from '../src/geofence/geofence.service';
import { ReportingService } from '../src/reporting/reporting.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { StampingService } from '../src/stamping/stamping.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// B-07: JArbSchG-Regelwerk wird ueber das Geburtsdatum automatisch aktiviert
// und am 18. Geburtstag automatisch umgeschaltet - Ende-zu-Ende ueber den
// Timesheet (per-Datum-Baseline in der Regel-Aufloesung).
const stamp = Date.now();
const TENANT = `itest-minor-${stamp}`;

let pool: Pool;
let stamping: StampingService;
let reporting: ReportingService;
let tenantContext: TenantContextService;

const auditStub = { append: async () => undefined } as unknown as AuditClient;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
  const db = drizzle(pool, { schema }) as unknown as Database;
  tenantContext = new TenantContextService();
  const geofence = new GeofenceService(db, tenantContext, auditStub);
  const workLocations = new WorkLocationService(db, tenantContext, auditStub);
  const resolution = new RuleResolutionService(db, tenantContext);
  stamping = new StampingService(db, tenantContext, auditStub, geofence, workLocations, resolution);
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

async function employeeWithBirthDate(birthDate: string | null): Promise<string> {
  const emp = await withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into employees (tenant_id, personnel_number, display_name, birth_date)
       values ($1, 'MJ-${Math.floor(Math.random() * 1e9)}', 'Azubi Probe', $2) returning id`,
      [TENANT, birthDate],
    ),
  );
  return emp.rows[0].id;
}

/** 5 h Arbeit ohne Pause am gegebenen Tag (06:00-11:00 lokal). */
async function fiveHourDay(employeeId: string, isoDate: string): Promise<void> {
  for (const [kind, hourUtc] of [
    ['clock_in', '04'],
    ['clock_out', '09'],
  ] as const) {
    await asTenant(() =>
      stamping.stamp({
        employeeId,
        kind,
        source: 'web',
        occurredAt: `${isoDate}T${hourUtc}:00:00.000Z`,
        reason: 'Nacherfassung Testschicht',
      }),
    );
  }
}

describe('B-07: JArbSchG automatisch per Geburtsdatum', () => {
  it('17-jaehrig: 5 h ohne Pause ist ein Verstoss; am 18. Geburtstag gilt automatisch das ArbZG', async () => {
    // 18. Geburtstag am 04.06.2026: am 03.06. noch minderjaehrig.
    const emp = await employeeWithBirthDate('2008-06-04');
    await fiveHourDay(emp, '2026-06-03'); // Tag vor dem 18. Geburtstag
    await fiveHourDay(emp, '2026-06-04'); // 18. Geburtstag

    const sheet = await asTenant(() => reporting.timesheet(emp, '2026-06-03', '2026-06-04'));
    const before = sheet.days.find((d) => d.date === '2026-06-03');
    const after = sheet.days.find((d) => d.date === '2026-06-04');
    // JArbSchG § 11: > 4,5 h ohne Pause -> Verstoss (Erwachsene: erst > 6 h).
    expect(before?.findings.map((f) => f.code)).toContain('BREAK_MISSING');
    expect(before?.findings.map((f) => f.code)).toContain('CONTINUOUS_WORK_EXCEEDED');
    // Automatische Umschaltung am 18. Geburtstag: dieselbe Schicht ist konform.
    expect(after?.findings).toHaveLength(0);
  });

  it('Nachtruhe § 14: Arbeit nach 20:00 lokal wird fuer Minderjaehrige gemeldet', async () => {
    const emp = await employeeWithBirthDate('2009-01-15');
    for (const [kind, at] of [
      ['clock_in', '2026-06-10T14:00:00.000Z'], // 16:00 lokal
      ['clock_out', '2026-06-10T19:00:00.000Z'], // 21:00 lokal
    ] as const) {
      await asTenant(() =>
        stamping.stamp({
          employeeId: emp,
          kind,
          source: 'web',
          occurredAt: at,
          reason: 'Nacherfassung Testschicht',
        }),
      );
    }
    const sheet = await asTenant(() => reporting.timesheet(emp, '2026-06-10', '2026-06-10'));
    expect(sheet.days[0]?.findings.map((f) => f.code)).toContain('WORK_OUTSIDE_ALLOWED_WINDOW');
  });

  it('ohne Geburtsdatum gilt das Erwachsenen-Regelwerk (Datensparsamkeit)', async () => {
    const emp = await employeeWithBirthDate(null);
    await fiveHourDay(emp, '2026-06-15');
    const sheet = await asTenant(() => reporting.timesheet(emp, '2026-06-15', '2026-06-15'));
    expect(sheet.days[0]?.findings).toHaveLength(0);
  });
});
