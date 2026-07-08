import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { ReportingService } from '../src/reporting/reporting.service';
import { ReprocessingService } from '../src/rules/reprocessing.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { RulesService } from '../src/rules/rules.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// B-03: Verkuerzung der Ruhezeit auf 10 h (Ausnahmebranche, TV-Regelsatz)
// verlangt den Ausgleich durch eine >= 12-h-Ruhezeit binnen Frist -
// der Verstossreport meldet fehlenden Ausgleich nach Fristablauf.
const stamp = Date.now();
const TENANT = `itest-restc-${stamp}`;

let pool: Pool;
let reporting: ReportingService;
let rules: RulesService;
let tenantContext: TenantContextService;

const auditStub = { append: async () => undefined } as unknown as AuditClient;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
  const db = drizzle(pool, { schema }) as unknown as Database;
  tenantContext = new TenantContextService();
  const workLocations = new WorkLocationService(db, tenantContext, auditStub);
  const resolution = new RuleResolutionService(db, tenantContext);
  const reprocessing = new ReprocessingService(db, tenantContext, auditStub, resolution, workLocations);
  rules = new RulesService(db, tenantContext, auditStub, reprocessing);
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
  const tv = await asTenant(() =>
    rules.createAgreement({
      kind: 'collective_agreement',
      name: `MTV Ausnahmebranche ${stamp}`,
      reference: 'MTV, § 9 Ruhezeit (Ausnahmebranche)',
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
       values ($1, 'RC-${Math.floor(Math.random() * 1e9)}', 'Ruhezeit Probe') returning id`,
      [TENANT],
    ),
  );
  return emp.rows[0].id;
}

async function insertShifts(employeeId: string, pairs: Array<[string, string]>): Promise<void> {
  const values = pairs.flatMap(([cin, cout]) => [
    `('${TENANT}', '${employeeId}', 'clock_in',  '${cin}', 'web')`,
    `('${TENANT}', '${employeeId}', 'clock_out', '${cout}', 'web')`,
  ]);
  await withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into stamp_events (tenant_id, employee_id, kind, occurred_at, source)
       values ${values.join(',')}`,
    ),
  );
}

describe('B-03: Ruhezeit-Verkuerzung mit Ausgleichspflicht', () => {
  it('Frist abgelaufen ohne 12-h-Ausgleich: REST_COMPENSATION_MISSING im Verstossreport', async () => {
    const emp = await employee();
    // 10,5-h-Ruhe (18:00 -> 04:30), Folge-Ruhezeiten nur 11 h - kein Ausgleich.
    await insertShifts(emp, [
      ['2026-04-01T10:00:00Z', '2026-04-01T18:00:00Z'],
      ['2026-04-02T04:30:00Z', '2026-04-02T12:00:00Z'], // Ruhe davor: 10,5 h
      ['2026-04-02T23:00:00Z', '2026-04-03T05:00:00Z'], // Ruhe: 11 h
    ]);
    const entries = await asTenant(() => reporting.violations('2026-04-01', '2026-04-30'));
    const codes = entries
      .filter((e) => e.employeeId === emp)
      .flatMap((e) => e.findings.map((f) => f.code));
    expect(codes).toContain('REST_COMPENSATION_MISSING');
    // Die 10,5-h-Ruhe selbst ist unter dem TV KEIN Ruhezeitverstoss.
    expect(codes).not.toContain('REST_PERIOD_TOO_SHORT');
  });

  it('mit 12-h-Ausgleich innerhalb der Frist: kein Befund', async () => {
    const emp = await employee();
    await insertShifts(emp, [
      ['2026-04-01T10:00:00Z', '2026-04-01T18:00:00Z'],
      ['2026-04-02T04:30:00Z', '2026-04-02T12:00:00Z'], // Ruhe davor: 10,5 h
      ['2026-04-03T02:00:00Z', '2026-04-03T08:00:00Z'], // Ruhe: 14 h (Ausgleich)
    ]);
    const entries = await asTenant(() => reporting.violations('2026-04-01', '2026-04-30'));
    const codes = entries
      .filter((e) => e.employeeId === emp)
      .flatMap((e) => e.findings.map((f) => f.code));
    expect(codes).not.toContain('REST_COMPENSATION_MISSING');
    expect(codes).not.toContain('REST_COMPENSATION_PENDING');
  });
});
