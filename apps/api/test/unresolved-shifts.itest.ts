import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import { CorrectionService } from '../src/correction/correction.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { ExportService } from '../src/export/export.service';
import { GeofenceService } from '../src/geofence/geofence.service';
import { ReportingService } from '../src/reporting/reporting.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { StampingService } from '../src/stamping/stamping.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// Service-Level-Tests fuer das unresolved-Zustandsmodell (ADR-0019):
//  - clock_in ist IMMER erfolgreich (frueher 409 bei offener Vorschicht).
//  - Der Report zeigt die Untergrenze + SHIFT_UNRESOLVED; die Ruhezeit gegen
//    die Untergrenze ist "nicht pruefbar", nie stillschweigend eingehalten.
//  - Der Lohnexport schliesst unaufgeloeste Schichten aus (zahlt nie auf
//    eine Untergrenze); nach menschlicher Aufloesung zaehlt die Schicht.
const stamp = Date.now();
const TENANT = `itest-unres-${stamp}`;

let pool: Pool;
let stamping: StampingService;
let corrections: CorrectionService;
let reporting: ReportingService;
let exportService: ExportService;
let tenantContext: TenantContextService;

const auditStub = { append: async () => undefined } as unknown as AuditClient;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
  const db = drizzle(pool, { schema }) as unknown as Database;
  tenantContext = new TenantContextService();
  const geofence = new GeofenceService(db, tenantContext, auditStub);
  const workLocations = new WorkLocationService(db, tenantContext, auditStub);
  const rules = new RuleResolutionService(db, tenantContext);
  stamping = new StampingService(db, tenantContext, auditStub, geofence, workLocations, rules);
  corrections = new CorrectionService(db, tenantContext, auditStub);
  reporting = new ReportingService(db, tenantContext, workLocations, rules);
  exportService = new ExportService(db, tenantContext, auditStub, workLocations, rules);

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

async function freshEmployee(): Promise<{ id: string; personnelNumber: string }> {
  const personnelNumber = `UN-${Math.floor(Math.random() * 1e9)}`;
  const emp = await withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into employees (tenant_id, personnel_number, display_name)
       values ($1, $2, 'Unresolved Probe') returning id`,
      [TENANT, personnelNumber],
    ),
  );
  return { id: emp.rows[0].id, personnelNumber };
}

function pastStamp(
  employeeId: string,
  kind: 'clock_in' | 'break_start' | 'break_end' | 'clock_out',
  occurredAt: string,
) {
  return asTenant(() =>
    stamping.stamp({
      employeeId,
      kind,
      source: 'web',
      occurredAt,
      reason: 'Nacherfassung Testschicht',
    }),
  );
}

describe('unresolved-Zustandsmodell (ADR-0019)', () => {
  it('PO-Szenario: vergessenes clock_out blockiert das naechste clock_in NICHT; Report zeigt Untergrenze und "nicht pruefbar"', async () => {
    const emp = await freshEmployee();
    // Mo 14:00-? lokal: Pause 18:00-18:30 erfasst, clock_out (23:00) vergessen.
    await pastStamp(emp.id, 'clock_in', '2026-07-06T12:00:00.000Z');
    await pastStamp(emp.id, 'break_start', '2026-07-06T16:00:00.000Z');
    await pastStamp(emp.id, 'break_end', '2026-07-06T16:30:00.000Z');
    // Di 06:00 lokal, 11,5 h nach dem letzten Ereignis: frueher 409, jetzt ok.
    const next = await pastStamp(emp.id, 'clock_in', '2026-07-07T04:00:00.000Z');
    expect(next.event.id).toBeTruthy();
    await pastStamp(emp.id, 'clock_out', '2026-07-07T12:00:00.000Z');

    const sheet = await asTenant(() => reporting.timesheet(emp.id, '2026-07-06', '2026-07-07'));
    const monday = sheet.days.find((d) => d.date === '2026-07-06');
    const tuesday = sheet.days.find((d) => d.date === '2026-07-07');
    // Untergrenze: nur das abgeschlossene Intervall 14:00-18:00 (4 h).
    expect(monday?.workedMinutes).toBe(4 * 60);
    expect(monday?.findings.map((f) => f.code)).toContain('SHIFT_UNRESOLVED');
    // Ruhezeit gegen die Untergrenze (hoechstens 11,5 h) ist nicht beweisbar
    // verletzt -> "nicht pruefbar", NIE stillschweigend eingehalten.
    expect(tuesday?.workedMinutes).toBe(8 * 60);
    expect(tuesday?.findings.map((f) => f.code)).toContain('REST_PERIOD_UNVERIFIABLE');
    expect(tuesday?.findings.map((f) => f.code)).not.toContain('REST_PERIOD_TOO_SHORT');
  });

  it('Lohnexport schliesst unaufgeloeste Schichten aus (zahlt nie auf eine Untergrenze)', async () => {
    const emp = await freshEmployee();
    await pastStamp(emp.id, 'clock_in', '2026-05-11T06:00:00.000Z'); // Mo, clock_out vergessen
    await pastStamp(emp.id, 'clock_in', '2026-05-12T06:00:00.000Z'); // Di
    await pastStamp(emp.id, 'clock_out', '2026-05-12T14:00:00.000Z');

    const result = await asTenant(() =>
      exportService.runPayroll('2026-05-11', '2026-05-12', { work_time: { lohnart: '100' } }),
    );
    const line = result.content
      .split('\n')
      .find((l) => l.includes(emp.personnelNumber) && l.includes('work_time'));
    // Nur die abgeschlossene Dienstags-Schicht (480 min); die unaufgeloeste
    // Montags-Schicht traegt nichts bei - auch nicht ihre Untergrenze.
    expect(line).toBeDefined();
    expect(line).toContain('480');
  });

  it('menschliche Aufloesung per Anpassungsantrag: Schicht zaehlt danach voll (closed_by_correction)', async () => {
    const emp = await freshEmployee();
    await pastStamp(emp.id, 'clock_in', '2026-05-04T06:00:00.000Z'); // Mo, clock_out vergessen
    await pastStamp(emp.id, 'clock_in', '2026-05-05T06:00:00.000Z'); // Di

    const before = await asTenant(() => reporting.timesheet(emp.id, '2026-05-04', '2026-05-04'));
    expect(before.days.find((d) => d.date === '2026-05-04')?.workedMinutes).toBe(0);

    // Nachtrag des fehlenden clock_out durch den Menschen (Antrag + Freigabe).
    const req = await asTenant(() =>
      corrections.request({
        employeeId: emp.id,
        kind: 'add',
        proposedKind: 'clock_out',
        proposedOccurredAt: '2026-05-04T14:00:00.000Z',
        reason: 'Ausstempeln vergessen, Ende laut Schichtplan',
      }),
    );
    const decided = await asTenant(() => corrections.decide(req.id, 'approve'));
    expect(decided.status).toBe('approved');

    const after = await asTenant(() => reporting.timesheet(emp.id, '2026-05-04', '2026-05-04'));
    const monday = after.days.find((d) => d.date === '2026-05-04');
    expect(monday?.workedMinutes).toBe(8 * 60);
    expect(monday?.findings.map((f) => f.code)).not.toContain('SHIFT_UNRESOLVED');
  });
});
