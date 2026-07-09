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

// C-10: Zwei getrennte Wochenzaehler im Stundenzettel - Ueberstunden ueber
// das VERTRAGSMASS (pro Tarifvertrag konfigurierbar, Regelschicht) vs.
// Mehrarbeit ueber die Hoechstarbeitszeit.
const stamp = Date.now();
const TENANT = `itest-ot-${stamp}`;

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
});

afterAll(async () => {
  await pool.end();
});

function asTenant<T>(fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId: TENANT, userId: 'itest', roles: ['admin'] }, fn);
}

describe('C-10: Ueberstunden- und Mehrarbeit-Zaehler im Stundenzettel', () => {
  it('38-h-TV: 50-h-Woche ergibt 12 h Ueberstunden und 2 h Mehrarbeit; ohne TV nur Mehrarbeit', async () => {
    const emp = await withTenant(pool, TENANT, (c) =>
      c.query(
        `insert into employees (tenant_id, personnel_number, display_name)
         values ($1, 'OT-1001', 'Zaehler Probe') returning id`,
        [TENANT],
      ),
    ).then((r) => r.rows[0].id as string);

    // 5 Tage Mo-Fr je 10 h (06:00-16:00 UTC, keine Pausenstempel).
    for (let i = 0; i < 5; i += 1) {
      const day = `2026-07-${String(6 + i).padStart(2, '0')}`;
      await withTenant(pool, TENANT, (c) =>
        c.query(
          `insert into stamp_events (tenant_id, employee_id, kind, occurred_at, source)
           values ($1, $2, 'clock_in', $3, 'web'), ($1, $2, 'clock_out', $4, 'web')`,
          [TENANT, emp, `${day}T06:00:00.000Z`, `${day}T16:00:00.000Z`],
        ),
      );
    }

    // Ohne Vertragsmass: Ueberstunden nicht ableitbar, Mehrarbeit schon.
    const before = await asTenant(() => reporting.timesheet(emp, '2026-07-06', '2026-07-12'));
    expect(before.overtimeWeeks).toHaveLength(1);
    expect(before.overtimeWeeks[0]!.overtimeMinutes).toBeNull();
    expect(before.overtimeWeeks[0]!.extraWorkMinutes).toBe(120); // 50 h - 48 h

    // TV definiert das Vertragsmass: 38 h/Woche.
    const tv = await asTenant(() =>
      rules.createAgreement({
        kind: 'collective_agreement',
        name: `MTV 38h ${stamp}`,
        validFrom: '2026-01-01',
      }),
    );
    await asTenant(() =>
      rules.createRuleSet({
        name: 'Vertragsmass 38 h',
        layer: 'collective_agreement',
        collectiveAgreementId: tv.id,
        validFrom: '2026-01-01',
        params: { contractualWeeklyMinutes: 38 * 60 },
      }),
    );

    const after = await asTenant(() => reporting.timesheet(emp, '2026-07-06', '2026-07-12'));
    expect(after.overtimeWeeks[0]!.overtimeMinutes).toBe(720); // 50 h - 38 h
    expect(after.overtimeWeeks[0]!.extraWorkMinutes).toBe(120);
  });
});
