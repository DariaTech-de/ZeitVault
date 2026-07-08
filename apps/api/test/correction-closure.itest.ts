import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import { CorrectionService } from '../src/correction/correction.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { GeofenceService } from '../src/geofence/geofence.service';
import { ReportingService } from '../src/reporting/reporting.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { StampingService } from '../src/stamping/stamping.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// Service-Level-Tests fuer den KORREKTUR-ABSCHLUSS der Ladefenster und die
// Validierung von Einsatzort-Uebersteuerungen (Review-Funde Schnitt 1):
//  - Eine Korrektur, die einen Stempel weiter als das 48-h-Fenster verschiebt,
//    darf das Original in keinem Fenster wieder wirksam machen (GoBD,
//    keine Doppelzaehlung im Lohn).
//  - decide() validiert die Umgebung des ORIGINALS mit (Doppel-Fenster wie
//    correctStamp), laedt das Ziel per id und vererbt dessen Einsatzort.
//  - stamp() lehnt haengende/deaktivierte workLocationId-Uebersteuerungen ab.
const stamp = Date.now();
const TENANT = `itest-cc-${stamp}`;

let pool: Pool;
let stamping: StampingService;
let corrections: CorrectionService;
let reporting: ReportingService;
let workLocations: WorkLocationService;
let tenantContext: TenantContextService;

const auditStub = { append: async () => undefined } as unknown as AuditClient;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
  const db = drizzle(pool, { schema }) as unknown as Database;
  tenantContext = new TenantContextService();
  const geofence = new GeofenceService(db, tenantContext, auditStub);
  workLocations = new WorkLocationService(db, tenantContext, auditStub);
  const rules = new RuleResolutionService(db, tenantContext);
  stamping = new StampingService(db, tenantContext, auditStub, geofence, workLocations, rules);
  corrections = new CorrectionService(db, tenantContext, auditStub);
  reporting = new ReportingService(db, tenantContext, workLocations, rules);

  // Mandanten-Default-Einsatzort (Pflicht-Stammdatum).
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

async function freshEmployee(): Promise<string> {
  const emp = await withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into employees (tenant_id, personnel_number, display_name)
       values ($1, 'CC-${Math.floor(Math.random() * 1e9)}', 'Closure Probe') returning id`,
      [TENANT],
    ),
  );
  return emp.rows[0].id;
}

describe('Korrektur-Abschluss der Ladefenster (F2)', () => {
  it('eine um einen Monat verschobene Schicht verschwindet aus dem alten Monat und zaehlt nur im neuen', async () => {
    const emp = await freshEmployee();
    // Versehentlich auf den 05.06. erfasst - tatsaechlich war es der 05.07.
    const cin = await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'clock_in',
        source: 'web',
        occurredAt: '2026-06-05T06:00:00.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );
    const cout = await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'clock_out',
        source: 'web',
        occurredAt: '2026-06-05T14:00:00.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );
    // Beide Stempel um > 48 h (einen Monat) verschieben.
    await asTenant(() =>
      stamping.correctStamp({
        eventId: cout.event.id,
        occurredAt: '2026-07-05T14:00:00.000Z',
        correctionReason: 'Falscher Monat erfasst',
      }),
    );
    await asTenant(() =>
      stamping.correctStamp({
        eventId: cin.event.id,
        occurredAt: '2026-07-05T06:00:00.000Z',
        correctionReason: 'Falscher Monat erfasst',
      }),
    );

    // Juni-Fenster enthaelt die Korrektur-Ereignisse (05.07.) NICHT - ohne
    // Abschluss ueber corrects_event_id zaehlten die Originale hier doppelt.
    const june = await asTenant(() => reporting.timesheet(emp, '2026-06-01', '2026-06-30'));
    expect(june.totalWorkedMinutes).toBe(0);

    const july = await asTenant(() => reporting.timesheet(emp, '2026-07-01', '2026-07-31'));
    expect(july.totalWorkedMinutes).toBe(8 * 60);
    expect(july.days.find((d) => d.workedMinutes > 0)?.date).toBe('2026-07-05');
  });
});

describe('Anpassungsantrag: decide() validiert Original-Umgebung und Ziel (F3)', () => {
  it('Korrektur, die ein clock_out verwaisen liesse, wird abgelehnt (409)', async () => {
    const emp = await freshEmployee();
    const cin = await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'clock_in',
        source: 'web',
        occurredAt: '2026-06-01T06:00:00.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );
    await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'clock_out',
        source: 'web',
        occurredAt: '2026-06-01T14:00:00.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );
    // Vorschlag verschiebt das clock_in um 7 Tage (> 48-h-Fenster): das
    // clock_out vom 01.06. bliebe ohne Einstempeln zurueck.
    const req = await asTenant(() =>
      corrections.request({
        employeeId: emp,
        kind: 'correct',
        targetEventId: cin.event.id,
        proposedKind: 'clock_in',
        proposedOccurredAt: '2026-06-08T06:00:00.000Z',
        reason: 'Falscher Tag erfasst',
      }),
    );
    await expect(asTenant(() => corrections.decide(req.id, 'approve'))).rejects.toThrow(
      ConflictException,
    );
    // Transaktion zurueckgerollt: Antrag bleibt offen, kein Stempel angelegt.
    const status = await withTenant(pool, TENANT, (c) =>
      c.query('select status from stamp_correction_requests where id = $1', [req.id]),
    );
    expect(status.rows[0].status).toBe('requested');
  });

  it('Ziel-Stempel eines anderen Mitarbeitenden wird abgelehnt', async () => {
    const empA = await freshEmployee();
    const empB = await freshEmployee();
    const cin = await asTenant(() =>
      stamping.stamp({
        employeeId: empA,
        kind: 'clock_in',
        source: 'web',
        occurredAt: '2026-06-15T06:00:00.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );
    const req = await asTenant(() =>
      corrections.request({
        employeeId: empB,
        kind: 'correct',
        targetEventId: cin.event.id,
        proposedKind: 'clock_in',
        proposedOccurredAt: '2026-06-15T06:30:00.000Z',
        reason: 'Mitarbeiterfremdes Ziel',
      }),
    );
    await expect(asTenant(() => corrections.decide(req.id, 'approve'))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('nicht existentes Ziel wird abgelehnt (404)', async () => {
    const emp = await freshEmployee();
    const req = await asTenant(() =>
      corrections.request({
        employeeId: emp,
        kind: 'correct',
        targetEventId: '00000000-0000-4000-8000-000000000099',
        proposedKind: 'clock_in',
        proposedOccurredAt: '2026-06-20T06:00:00.000Z',
        reason: 'Haengendes Ziel',
      }),
    );
    await expect(asTenant(() => corrections.decide(req.id, 'approve'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('vererbt die Einsatzort-Uebersteuerung des per id geladenen Ziels', async () => {
    const emp = await freshEmployee();
    const loc = await asTenant(() =>
      workLocations.create({
        name: `Baustelle Kassel ${stamp}`,
        countryCode: 'DE',
        stateCode: 'HE',
        timeZone: 'Europe/Berlin',
        isDefault: false,
      }),
    );
    const cin = await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'clock_in',
        source: 'web',
        occurredAt: '2026-07-01T04:00:00.000Z',
        reason: 'Nacherfassung Testschicht',
        workLocationId: loc.id,
      }),
    );
    await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'clock_out',
        source: 'web',
        occurredAt: '2026-07-01T12:00:00.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );
    const req = await asTenant(() =>
      corrections.request({
        employeeId: emp,
        kind: 'correct',
        targetEventId: cin.event.id,
        proposedKind: 'clock_in',
        proposedOccurredAt: '2026-07-01T04:30:00.000Z',
        reason: 'Beginn korrigiert',
      }),
    );
    const decided = await asTenant(() => corrections.decide(req.id, 'approve'));
    expect(decided.appliedEventId).toBeTruthy();
    const row = await withTenant(pool, TENANT, (c) =>
      c.query('select work_location_id, corrects_event_id from stamp_events where id = $1', [
        decided.appliedEventId,
      ]),
    );
    expect(row.rows[0].work_location_id).toBe(loc.id);
    expect(row.rows[0].corrects_event_id).toBe(cin.event.id);
  });
});

describe('Einsatzort-Uebersteuerung wird beim Stempeln validiert (F5)', () => {
  it('unbekannte workLocationId wird abgelehnt', async () => {
    const emp = await freshEmployee();
    await expect(
      asTenant(() =>
        stamping.stamp({
          employeeId: emp,
          kind: 'clock_in',
          source: 'mobile',
          workLocationId: '00000000-0000-4000-8000-0000000000ff',
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('deaktivierter Einsatzort wird abgelehnt', async () => {
    const emp = await freshEmployee();
    const loc = await asTenant(() =>
      workLocations.create({
        name: `Stillgelegt ${stamp}`,
        countryCode: 'DE',
        stateCode: 'SN',
        timeZone: 'Europe/Berlin',
        isDefault: false,
      }),
    );
    await asTenant(() => workLocations.deactivate(loc.id));
    await expect(
      asTenant(() =>
        stamping.stamp({
          employeeId: emp,
          kind: 'clock_in',
          source: 'mobile',
          workLocationId: loc.id,
        }),
      ),
    ).rejects.toThrow(/deaktiviert/);
  });
});
