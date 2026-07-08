import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { GeofenceService } from '../src/geofence/geofence.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ReportingService } from '../src/reporting/reporting.service';
import { ReprocessingService } from '../src/rules/reprocessing.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { RulesService } from '../src/rules/rules.service';
import { StampingService } from '../src/stamping/stamping.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// Regelschicht (Schnitt 2, B-08/B-09):
//  - RLS-Pflichttests fuer collective_agreements/rule_sets (Kern-Invariante 3).
//  - B-08: Abweichender Regelsatz erfordert ein existierendes, aktives
//    collective_agreement-Objekt passender Ebene - ohne Referenz nicht
//    aktivierbar (Service + DB-CHECK).
//  - B-09: Konflikte werden bereits beim Anlegen mit 409 abgewiesen.
//  - Ende-zu-Ende: ein TV-Regelsatz veraendert die Bewertung (Ruhezeit),
//    eine BV-Kulanzfrist veraendert die unresolved-Klassifikation (ADR-0019).
const stamp = Date.now();
const TENANT = `itest-rules-${stamp}`;
const TENANT_B = `itest-rules-b-${stamp}`;

let pool: Pool;
let rules: RulesService;
let resolution: RuleResolutionService;
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
  resolution = new RuleResolutionService(db, tenantContext);
  const reprocessing = new ReprocessingService(db, tenantContext, auditStub, resolution, workLocations);
  rules = new RulesService(db, tenantContext, auditStub, reprocessing);
  const notificationsSvc = new NotificationsService(db, tenantContext);
  stamping = new StampingService(db, tenantContext, auditStub, geofence, workLocations, resolution, notificationsSvc);
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

async function freshEmployee(): Promise<string> {
  const emp = await withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into employees (tenant_id, personnel_number, display_name)
       values ($1, 'RL-${Math.floor(Math.random() * 1e9)}', 'Regel Probe') returning id`,
      [TENANT],
    ),
  );
  return emp.rows[0].id;
}

describe('RLS: collective_agreements und rule_sets sind mandantengetrennt', () => {
  it('fremder Mandant sieht keine Tarifwerke/Regelsaetze', async () => {
    await withTenant(pool, TENANT, (c) =>
      c.query(
        `insert into collective_agreements (tenant_id, kind, name, valid_from)
         values ($1, 'collective_agreement', 'RLS TV', '2026-01-01')`,
        [TENANT],
      ),
    );
    const fromB = await withTenant(pool, TENANT_B, (c) =>
      c.query('select id from collective_agreements'),
    );
    expect(fromB.rowCount).toBe(0);
    const setsFromB = await withTenant(pool, TENANT_B, (c) => c.query('select id from rule_sets'));
    expect(setsFromB.rowCount).toBe(0);
  });

  it('Insert mit fremdem tenant_id wird durch WITH CHECK abgelehnt', async () => {
    await expect(
      withTenant(pool, TENANT_B, (c) =>
        c.query(
          `insert into collective_agreements (tenant_id, kind, name, valid_from)
           values ($1, 'collective_agreement', 'Einbruch', '2026-01-01')`,
          [TENANT],
        ),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });
});

describe('B-08: Abweichung nur mit collective_agreement-Referenz', () => {
  it('DB-CHECK: TV-/BV-Regelsatz ohne Referenz ist nicht speicherbar', async () => {
    await expect(
      withTenant(pool, TENANT, (c) =>
        c.query(
          `insert into rule_sets (tenant_id, name, layer, valid_from, params)
           values ($1, 'Ohne Referenz', 'collective_agreement', '2026-01-01', '{"minRestMinutes":600}')`,
          [TENANT],
        ),
      ),
    ).rejects.toThrow(/rule_sets_agreement_required/);
  });

  it('Referenz muss existieren, aktiv sein und zur Ebene passen', async () => {
    await expect(
      asTenant(() =>
        rules.createRuleSet({
          name: 'Haengende Referenz',
          layer: 'collective_agreement',
          collectiveAgreementId: '00000000-0000-4000-8000-0000000000aa',
          validFrom: '2026-01-01',
          params: { minRestMinutes: 600 },
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    const bv = await asTenant(() =>
      rules.createAgreement({
        kind: 'works_agreement',
        name: `BV Arbeitszeit ${stamp}`,
        validFrom: '2026-01-01',
      }),
    );
    await expect(
      asTenant(() =>
        rules.createRuleSet({
          name: 'Falsche Ebene',
          layer: 'collective_agreement', // TV-Ebene, aber BV referenziert
          collectiveAgreementId: bv.id,
          validFrom: '2026-01-01',
          params: { minRestMinutes: 600 },
        }),
      ),
    ).rejects.toThrow(/works_agreement/);
  });

  it('Tarifwerk mit aktiven Regelsaetzen kann nicht deaktiviert werden', async () => {
    const tv = await asTenant(() =>
      rules.createAgreement({
        kind: 'collective_agreement',
        name: `MTV Deaktivierung ${stamp}`,
        validFrom: '2026-01-01',
      }),
    );
    const set = await asTenant(() =>
      rules.createRuleSet({
        name: 'Pausenstaffel TV',
        layer: 'collective_agreement',
        collectiveAgreementId: tv.id,
        validFrom: '2026-01-01',
        params: { breakMinutesTier1: 40 },
      }),
    );
    await expect(asTenant(() => rules.deactivateAgreement(tv.id))).rejects.toThrow(
      ConflictException,
    );
    await asTenant(() => rules.deactivateRuleSet(set.id));
    await asTenant(() => rules.deactivateAgreement(tv.id));
  });
});

describe('B-09: Konflikte werden beim Anlegen abgewiesen', () => {
  it('gleiche Ebene + gleicher Parameter + anderer Wert -> 409', async () => {
    const tv = await asTenant(() =>
      rules.createAgreement({
        kind: 'collective_agreement',
        name: `MTV Konflikt ${stamp}`,
        validFrom: '2026-01-01',
      }),
    );
    await asTenant(() =>
      rules.createRuleSet({
        name: 'Konflikt A',
        layer: 'collective_agreement',
        collectiveAgreementId: tv.id,
        validFrom: '2026-01-01',
        params: { maxContinuousWorkMinutes: 300 },
      }),
    );
    await expect(
      asTenant(() =>
        rules.createRuleSet({
          name: 'Konflikt B',
          layer: 'collective_agreement',
          collectiveAgreementId: tv.id,
          validFrom: '2026-03-01',
          params: { maxContinuousWorkMinutes: 240 },
        }),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('individuelle Verschlechterung -> 409 (Günstigkeitsprinzip)', async () => {
    const emp = await freshEmployee();
    await expect(
      asTenant(() =>
        rules.createRuleSet({
          name: 'Individuell schlechter',
          layer: 'individual',
          employeeId: emp,
          validFrom: '2026-01-01',
          params: { minRestMinutes: 9 * 60 },
        }),
      ),
    ).rejects.toThrow(ConflictException);
  });
});

describe('Ende-zu-Ende: Regelsaetze veraendern die Bewertung', () => {
  it('TV-Ruhezeit 10 h: 10,5 h Ruhe ist kein Verstoss mehr (Gesetz: 11 h)', async () => {
    const emp = await freshEmployee();
    // Schicht endet Mo 20:00 lokal; naechste beginnt Di 06:30 -> 10,5 h Ruhe.
    for (const [kind, at] of [
      ['clock_in', '2026-06-01T10:00:00.000Z'],
      ['clock_out', '2026-06-01T18:00:00.000Z'], // Mo 20:00 lokal
      ['clock_in', '2026-06-02T04:30:00.000Z'], // Di 06:30 lokal
      ['clock_out', '2026-06-02T10:30:00.000Z'],
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
    const before = await asTenant(() => reporting.timesheet(emp, '2026-06-01', '2026-06-02'));
    expect(
      before.days.flatMap((d) => d.findings.map((f) => f.code)),
    ).toContain('REST_PERIOD_TOO_SHORT');

    const tv = await asTenant(() =>
      rules.createAgreement({
        kind: 'collective_agreement',
        name: `MTV Ruhezeit ${stamp}`,
        reference: 'MTV Beispielbranche, § 12',
        validFrom: '2026-01-01',
      }),
    );
    await asTenant(() =>
      rules.createRuleSet({
        name: 'TV-Ruhezeit 10 h',
        layer: 'collective_agreement',
        collectiveAgreementId: tv.id,
        validFrom: '2026-01-01',
        params: { minRestMinutes: 10 * 60 },
      }),
    );

    const after = await asTenant(() => reporting.timesheet(emp, '2026-06-01', '2026-06-02'));
    expect(
      after.days.flatMap((d) => d.findings.map((f) => f.code)),
    ).not.toContain('REST_PERIOD_TOO_SHORT');
  });

  it('BV-Kulanzfrist 8 h: eine 9 h offene Schicht gilt als unresolved (ADR-0019)', async () => {
    const emp = await freshEmployee();
    const now = new Date();
    const nineHoursAgo = new Date(now.getTime() - 9 * 60 * 60 * 1000).toISOString();
    await asTenant(() =>
      stamping.stamp({ employeeId: emp, kind: 'clock_in', source: 'web', occurredAt: nineHoursAgo }),
    );
    // Gesetzes-Grundwert 16 h: Schicht laeuft noch.
    const beforeBv = await asTenant(() => stamping.today(emp, now));
    expect(beforeBv.status.state).toBe('in');

    const bv = await asTenant(() =>
      rules.createAgreement({
        kind: 'works_agreement',
        name: `BV Kulanzfrist ${stamp}`,
        validFrom: '2026-01-01',
      }),
    );
    await asTenant(() =>
      rules.createRuleSet({
        name: 'BV-Kulanzfrist 8 h',
        layer: 'works_agreement',
        collectiveAgreementId: bv.id,
        validFrom: '2026-01-01',
        params: { openShiftGraceMinutes: 8 * 60 },
      }),
    );

    const afterBv = await asTenant(() => stamping.today(emp, now));
    expect(afterBv.status.state).toBe('out');
    expect(afterBv.findings.map((f) => f.code)).toContain('SHIFT_UNRESOLVED');
  });
});
