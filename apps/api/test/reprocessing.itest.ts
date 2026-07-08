import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
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

// B-10: "Ein Tarifabschluss im Juni gilt ab Januar" - ein rueckwirkend
// angelegter Regelsatz loest die Neubewertung der betroffenen Perioden aus.
// Der Lauf wird protokolliert (reprocessing_runs) und auditiert; die
// Differenz-Erzeugung folgt mit F-04 (Schnitt 5).
const stamp = Date.now();
const TENANT = `itest-reproc-${stamp}`;

let pool: Pool;
let rules: RulesService;
let reprocessing: ReprocessingService;
let stamping: StampingService;
let reporting: ReportingService;
let tenantContext: TenantContextService;

const auditEvents: Array<{ action: string; payload: Record<string, unknown> }> = [];
const auditStub = {
  append: async (e: { action: string; payload: Record<string, unknown> }) => {
    auditEvents.push({ action: e.action, payload: e.payload });
  },
} as unknown as AuditClient;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
  const db = drizzle(pool, { schema }) as unknown as Database;
  tenantContext = new TenantContextService();
  const geofence = new GeofenceService(db, tenantContext, auditStub);
  const workLocations = new WorkLocationService(db, tenantContext, auditStub);
  const resolution = new RuleResolutionService(db, tenantContext);
  reprocessing = new ReprocessingService(db, tenantContext, auditStub, resolution, workLocations);
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

describe('B-10: Rueckwirkender Regelsatz loest protokollierte Neubewertung aus', () => {
  it('Tarifabschluss im Juli, gueltig ab Januar: Lauf ueber die betroffenen Perioden, Befunde aendern sich', async () => {
    const emp = await withTenant(pool, TENANT, (c) =>
      c.query(
        `insert into employees (tenant_id, personnel_number, display_name)
         values ($1, 'RP-1001', 'Retro Probe') returning id`,
        [TENANT],
      ),
    ).then((r) => r.rows[0].id as string);

    // Januar-Schichten mit 10,5 h Ruhe: unter Gesetz (11 h) ein Verstoss.
    for (const [kind, at] of [
      ['clock_in', '2026-01-12T09:00:00.000Z'],
      ['clock_out', '2026-01-12T19:00:00.000Z'], // Mo 20:00 lokal
      ['clock_in', '2026-01-13T05:30:00.000Z'], // Di 06:30 lokal
      ['clock_out', '2026-01-13T11:30:00.000Z'],
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
    const before = await asTenant(() => reporting.timesheet(emp, '2026-01-12', '2026-01-13'));
    expect(before.days.flatMap((d) => d.findings.map((f) => f.code))).toContain(
      'REST_PERIOD_TOO_SHORT',
    );

    // "Tarifabschluss im Juli, gilt ab Januar": Anlegen triggert den Lauf.
    const tv = await asTenant(() =>
      rules.createAgreement({
        kind: 'collective_agreement',
        name: `MTV Retro ${stamp}`,
        reference: 'Tarifabschluss 2026-07, rueckwirkend ab 2026-01-01',
        validFrom: '2026-01-01',
      }),
    );
    const set = await asTenant(() =>
      rules.createRuleSet({
        name: 'TV-Ruhezeit 10 h (retro)',
        layer: 'collective_agreement',
        collectiveAgreementId: tv.id,
        validFrom: '2026-01-01',
        params: { minRestMinutes: 10 * 60 },
      }),
    );

    // Lauf ist protokolliert: Zeitraum = Gueltigkeit (gekappt auf heute).
    const runs = await asTenant(() => reprocessing.listRuns());
    const run = runs.find((r) => r.ruleSetId === set.id);
    expect(run).toBeDefined();
    expect(run?.triggerKind).toBe('rule_set_change');
    expect(run?.fromDate).toBe('2026-01-01');
    expect(run?.status).toBe('completed');
    const summary = run?.summary as Record<string, number>;
    expect(summary.employeesEvaluated).toBeGreaterThanOrEqual(1);
    expect(summary.daysEvaluated).toBeGreaterThanOrEqual(2);

    // AuditEvent fuer den Lauf (Kern-Invariante 2).
    expect(auditEvents.some((e) => e.action === 'rules.reprocessing_run')).toBe(true);

    // Die Neubewertung wirkt: der Januar-Verstoss ist unter dem TV keiner mehr.
    const after = await asTenant(() => reporting.timesheet(emp, '2026-01-12', '2026-01-13'));
    expect(after.days.flatMap((d) => d.findings.map((f) => f.code))).not.toContain(
      'REST_PERIOD_TOO_SHORT',
    );

    // Deaktivierung wirkt ebenfalls rueckwirkend und protokolliert erneut.
    await asTenant(() => rules.deactivateRuleSet(set.id));
    const runsAfter = await asTenant(() => reprocessing.listRuns());
    expect(runsAfter.filter((r) => r.ruleSetId === set.id).length).toBeGreaterThanOrEqual(2);
    const revert = await asTenant(() => reporting.timesheet(emp, '2026-01-12', '2026-01-13'));
    expect(revert.days.flatMap((d) => d.findings.map((f) => f.code))).toContain(
      'REST_PERIOD_TOO_SHORT',
    );
  });

  it('zukuenftig wirksamer Regelsatz loest keinen Lauf aus', async () => {
    const tv = await asTenant(() =>
      rules.createAgreement({
        kind: 'collective_agreement',
        name: `MTV Zukunft ${stamp}`,
        validFrom: '2027-01-01',
      }),
    );
    const set = await asTenant(() =>
      rules.createRuleSet({
        name: 'Zukunft',
        layer: 'collective_agreement',
        collectiveAgreementId: tv.id,
        validFrom: '2027-01-01',
        params: { breakMinutesTier1: 35 },
      }),
    );
    const runs = await asTenant(() => reprocessing.listRuns());
    expect(runs.find((r) => r.ruleSetId === set.id)).toBeUndefined();
  });
});
