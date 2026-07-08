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

// B-11: Taegliche und woechentliche Hoechstarbeitszeit parallel, pro
// MITARBEITERGRUPPE umschaltbar (max_working_time_mode) - der Wochenmassstab
// ist tarifgebunden (gruppen-gescopter TV-Regelsatz). RLS-Pflichttests fuer
// die neuen Gruppen-Tabellen.
const stamp = Date.now();
const TENANT = `itest-grp-${stamp}`;
const TENANT_B = `itest-grp-b-${stamp}`;

let pool: Pool;
let rules: RulesService;
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
       values ($1, 'GR-${Math.floor(Math.random() * 1e9)}', 'Gruppen Probe') returning id`,
      [TENANT],
    ),
  );
  return emp.rows[0].id;
}

/** 5 x 11 h (Mo-Fr, 01.-05.06.2026): Schicht 06:00-17:45 lokal mit 45 min Pause. */
async function stampElevenHourWeek(employeeId: string): Promise<void> {
  for (let day = 1; day <= 5; day += 1) {
    const d = String(day).padStart(2, '0');
    for (const [kind, at] of [
      ['clock_in', `2026-06-${d}T04:00:00.000Z`], // 06:00 lokal
      ['break_start', `2026-06-${d}T10:00:00.000Z`],
      ['break_end', `2026-06-${d}T10:45:00.000Z`],
      ['clock_out', `2026-06-${d}T15:45:00.000Z`], // 17:45 lokal
    ] as const) {
      await asTenant(() =>
        stamping.stamp({
          employeeId,
          kind,
          source: 'web',
          occurredAt: at,
          reason: 'Nacherfassung Testschicht',
        }),
      );
    }
  }
}

describe('RLS: employee_groups / employee_group_members', () => {
  it('Gruppen und Mitgliedschaften sind mandantengetrennt', async () => {
    const grp = await asTenant(() => rules.createGroup({ name: 'RLS Gruppe' }));
    expect(grp.id).toBeTruthy();
    const fromB = await withTenant(pool, TENANT_B, (c) => c.query('select id from employee_groups'));
    expect(fromB.rowCount).toBe(0);
    await expect(
      withTenant(pool, TENANT_B, (c) =>
        c.query(
          `insert into employee_groups (tenant_id, name) values ($1, 'Einbruch')`,
          [TENANT],
        ),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });
});

describe('B-11: max_working_time_mode je Mitarbeitergruppe', () => {
  it('Gruppe im Wochenmassstab: keine Tagesbefunde, aber 55 h > 48 h als Wochenverstoss; ausserhalb der Gruppe gilt der Tagesmassstab', async () => {
    const inGroup = await freshEmployee();
    const outside = await freshEmployee();

    const group = await asTenant(() => rules.createGroup({ name: `Schichtbetrieb ${stamp}` }));
    await asTenant(() =>
      rules.assignGroupMember({ groupId: group.id, employeeId: inGroup, validFrom: '2026-01-01' }),
    );
    const tv = await asTenant(() =>
      rules.createAgreement({
        kind: 'collective_agreement',
        name: `MTV Wochenarbeitszeit ${stamp}`,
        reference: 'MTV, § 4 Wochenarbeitszeit',
        validFrom: '2026-01-01',
      }),
    );
    await asTenant(() =>
      rules.createRuleSet({
        name: 'Wochenmassstab Schichtbetrieb',
        layer: 'collective_agreement',
        collectiveAgreementId: tv.id,
        employeeGroupId: group.id,
        validFrom: '2026-01-01',
        params: { maxWorkingTimeMode: 'weekly' },
      }),
    );

    await stampElevenHourWeek(inGroup);
    await stampElevenHourWeek(outside);

    const inSheet = await asTenant(() => reporting.timesheet(inGroup, '2026-06-01', '2026-06-07'));
    const inCodes = inSheet.days.flatMap((d) => d.findings.map((f) => f.code));
    // Einzelne Tage duerfen laenger sein - kein Tagesmaximum-Befund ...
    expect(inCodes).not.toContain('MAX_DAILY_WORKTIME_EXTENDED_EXCEEDED');
    // ... aber die Woche (5 x 11 h = 55 h) ueberschreitet 48 h.
    expect(inCodes).toContain('MAX_WEEKLY_WORKTIME_EXCEEDED');
    expect(
      inSheet.days.find((d) => d.date === '2026-06-05')?.findings.map((f) => f.code),
    ).toContain('MAX_WEEKLY_WORKTIME_EXCEEDED');

    const outSheet = await asTenant(() => reporting.timesheet(outside, '2026-06-01', '2026-06-07'));
    const outCodes = outSheet.days.flatMap((d) => d.findings.map((f) => f.code));
    // Ausserhalb der Gruppe gilt das heutige Recht: Tagesmassstab.
    expect(outCodes).toContain('MAX_DAILY_WORKTIME_EXTENDED_EXCEEDED');
    expect(outCodes).not.toContain('MAX_WEEKLY_WORKTIME_EXCEEDED');
  });
});
