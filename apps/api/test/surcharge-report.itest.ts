import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { GeofenceService } from '../src/geofence/geofence.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { SurchargeReportService } from '../src/reporting/surcharge-report.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { StampingService } from '../src/stamping/stamping.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// K-04: Zuschlagsminuten aus ECHTEN Stempeln - minutengenau ueber Mitternacht
// und DST, bewertet in der Einsatzort-Zeitzone (Schnitt 4: C-01..C-08 an der
// realen Pipeline stamp -> foldShifts -> classifySurchargeMinutes).
const stamp = Date.now();
const TENANT = `itest-surch-${stamp}`;

let pool: Pool;
let stamping: StampingService;
let workLocations: WorkLocationService;
let surcharges: SurchargeReportService;
let tenantContext: TenantContextService;
let defaultLocationId: string;
let snLocationId: string;

const auditStub = { append: async () => undefined } as unknown as AuditClient;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
  const db = drizzle(pool, { schema }) as unknown as Database;
  tenantContext = new TenantContextService();
  const geofence = new GeofenceService(db, tenantContext, auditStub);
  workLocations = new WorkLocationService(db, tenantContext, auditStub);
  const resolution = new RuleResolutionService(db, tenantContext);
  const notifications = new NotificationsService(db, tenantContext);
  stamping = new StampingService(db, tenantContext, auditStub, geofence, workLocations, resolution, notifications);
  surcharges = new SurchargeReportService(db, tenantContext, workLocations, resolution);

  const by = await asTenant(() =>
    workLocations.create({
      name: 'Werk Muenchen',
      countryCode: 'DE',
      stateCode: 'BY',
      timeZone: 'Europe/Berlin',
      isDefault: true,
    }),
  );
  defaultLocationId = by.id;
  const sn = await asTenant(() =>
    workLocations.create({
      name: 'Werk Leipzig',
      countryCode: 'DE',
      stateCode: 'SN',
      timeZone: 'Europe/Berlin',
      isDefault: false,
    }),
  );
  snLocationId = sn.id;
});

afterAll(async () => {
  await pool.end();
});

function asTenant<T>(fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId: TENANT, userId: 'itest', roles: ['admin'] }, fn);
}

async function makeEmployee(pn: string, hourlyBaseWageCents?: number): Promise<string> {
  return withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into employees (tenant_id, personnel_number, display_name, hourly_base_wage_cents)
       values ($1, $2, $3, $4) returning id`,
      [TENANT, pn, `Zuschlag ${pn}`, hourlyBaseWageCents ?? null],
    ),
  ).then((r) => r.rows[0].id as string);
}

async function stampMany(
  employeeId: string,
  events: ReadonlyArray<readonly ['clock_in' | 'break_start' | 'break_end' | 'clock_out', string]>,
  workLocationId?: string,
): Promise<void> {
  for (const [kind, at] of events) {
    await asTenant(() =>
      stamping.stamp({
        employeeId,
        kind,
        source: 'web',
        occurredAt: at,
        reason: 'Nacherfassung Testschicht',
        ...(workLocationId ? { workLocationId } : {}),
      }),
    );
  }
}

describe('K-04: DST-Fruehjahrsnacht an echten Stempeln (28./29.03.2026)', () => {
  it('22:00-06:00 lokal sind 7 reale Stunden Nacht; 0-4-Fenster real 3 h; Sonntag ab echter Mitternacht', async () => {
    const emp = await makeEmployee('SUR-1001');
    await stampMany(emp, [
      ['clock_in', '2026-03-28T21:00:00.000Z'], // Sa 22:00 CET
      ['clock_out', '2026-03-29T04:00:00.000Z'], // So 06:00 CEST
    ]);
    const report = await asTenant(() => surcharges.report('2026-03-01', '2026-03-31'));
    const mine = report.find((e) => e.employeeId === emp);
    expect(mine).toBeDefined();
    expect(mine!.minutes.night25Minutes + mine!.minutes.night40Minutes).toBe(7 * 60);
    expect(mine!.minutes.night40Minutes).toBe(180); // 00-02 + 03-04 (02-03 existiert nicht)
    expect(mine!.minutes.sunday50Minutes).toBe(300); // reale So-Minuten 0-6 Uhr
    // Ohne Grundlohn keine Betraege - nur Minuten.
    expect(mine!.amounts).toBeNull();
  });
});

describe('Pruefstein So 22:00 - Mo 06:00 mit Grundlohn 40 EUR/h (C-02/C-03a/C-06)', () => {
  it('liefert Fenster-Minuten und Betraege mit getrennten Feldern steuerfrei/SV-frei', async () => {
    const emp = await makeEmployee('SUR-1002', 4000);
    await stampMany(emp, [
      ['clock_in', '2026-07-05T20:00:00.000Z'], // So 22:00 CEST
      ['clock_out', '2026-07-06T04:00:00.000Z'], // Mo 06:00 CEST
    ]);
    const report = await asTenant(() => surcharges.report('2026-07-01', '2026-07-31'));
    const mine = report.find((e) => e.employeeId === emp)!;
    expect(mine.minutes.night40Minutes).toBe(240); // Mo 0-4 (Aufnahme vor 0 Uhr)
    expect(mine.minutes.night25Minutes).toBe(240); // 22-24 + 04-06
    expect(mine.minutes.sunday50Minutes).toBe(360); // So 22-24 + Fortwirkung Mo 0-4

    expect(mine.amounts).not.toBeNull();
    const byKind = new Map(mine.amounts!.components.map((c) => [c.kind, c]));
    const night25 = byKind.get('night25')!;
    expect(night25.amountCents).toBe(4000); // 240 min x 40 EUR x 25 %
    expect(night25.taxFreeCents).toBe(4000); // 40 <= 50 EUR/h: voll steuerfrei
    expect(night25.svFreeCents).toBe(2500); // Basis bei 25 EUR/h gekappt
    expect(night25.svLiableCents).toBe(1500); // beitragspflichtiger Rest
    const sunday = byKind.get('sunday50')!;
    expect(sunday.amountCents).toBe(12000); // 360 min x 40 EUR x 50 %
    expect(sunday.svLiableCents).toBe(4500);
  });
});

describe('C-08: Feiertagszuschlag folgt dem je Schicht wirksamen Einsatzort', () => {
  it('Fronleichnam: Default BY -> 125 %; Uebersteuerung der Schicht auf SN -> keiner', async () => {
    // Fronleichnam 2026: 04.06.; 11:00-16:00 lokal (CEST) = 09:00Z-14:00Z.
    const empBy = await makeEmployee('SUR-1003');
    await stampMany(empBy, [
      ['clock_in', '2026-06-04T09:00:00.000Z'],
      ['clock_out', '2026-06-04T14:00:00.000Z'],
    ]);
    const empSn = await makeEmployee('SUR-1004');
    await stampMany(
      empSn,
      [
        ['clock_in', '2026-06-04T09:00:00.000Z'],
        ['clock_out', '2026-06-04T14:00:00.000Z'],
      ],
      snLocationId,
    );
    const report = await asTenant(() => surcharges.report('2026-06-01', '2026-06-30'));
    const by = report.find((e) => e.employeeId === empBy)!;
    const sn = report.find((e) => e.employeeId === empSn)!;
    expect(by.minutes.holiday125Minutes).toBe(300);
    expect(sn.minutes.holiday125Minutes).toBe(0);
    expect(sn.minutes.dayNoneMinutes).toBe(300);
  });
});

describe('ADR-0019: unaufgeloeste Schichten werden nicht verguetet', () => {
  it('Schicht ohne Ausstempeln zaehlt nicht in die Zuschlagsminuten (ausgewiesen)', async () => {
    const emp = await makeEmployee('SUR-1005');
    await stampMany(emp, [
      ['clock_in', '2026-07-07T20:00:00.000Z'], // Di 22:00, nie beendet
      ['clock_in', '2026-07-08T14:00:00.000Z'], // Mi 16:00 -> Vorschicht unresolved
      ['clock_out', '2026-07-08T20:00:00.000Z'], // Mi 22:00
    ]);
    const report = await asTenant(() => surcharges.report('2026-07-01', '2026-07-31'));
    const mine = report.find((e) => e.employeeId === emp)!;
    // Nur die geschlossene Mi-Schicht (16-22 lokal): 120 min Nacht (20-22).
    expect(mine.minutes.night25Minutes).toBe(120);
    expect(mine.minutes.night40Minutes).toBe(0);
    expect(mine.excludedUnresolvedShifts).toBe(1);
  });
});
