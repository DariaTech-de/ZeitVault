import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { ExportService } from '../src/export/export.service';
import { PayrollMappingService } from '../src/export/payroll-mapping.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// C-11: Mandantenspezifisches Lohnartenmapping, PERSISTIERT und in der
// Oberflaeche pflegbar - eine Aenderung ist ohne Deployment wirksam. Der
// Lohnexport nutzt das persistierte Mapping (kein Mapping im Request-Body).
const stamp = Date.now();
const TENANT = `itest-pm-${stamp}`;
const TENANT_B = `itest-pm-b-${stamp}`;

let pool: Pool;
let exportService: ExportService;
let mappings: PayrollMappingService;
let tenantContext: TenantContextService;

const auditStub = { append: async () => undefined } as unknown as AuditClient;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
  const db = drizzle(pool, { schema }) as unknown as Database;
  tenantContext = new TenantContextService();
  const workLocations = new WorkLocationService(db, tenantContext, auditStub);
  const rules = new RuleResolutionService(db, tenantContext);
  mappings = new PayrollMappingService(db, tenantContext, auditStub);
  exportService = new ExportService(db, tenantContext, auditStub, workLocations, rules, mappings);

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

describe('C-11: persistiertes Lohnartenmapping steuert den Export', () => {
  it('AK: Aenderung des Mappings ist ohne Deployment wirksam; Faktor je Bewertungsart moeglich', async () => {
    const emp = await withTenant(pool, TENANT, (c) =>
      c.query(
        `insert into employees (tenant_id, personnel_number, display_name)
         values ($1, 'PM-1001', 'Mapping Probe') returning id`,
        [TENANT],
      ),
    ).then((r) => r.rows[0].id as string);
    await withTenant(pool, TENANT, (c) =>
      c.query(
        `insert into stamp_events (tenant_id, employee_id, kind, occurred_at, source)
         values ($1, $2, 'clock_in', '2026-07-06T06:00:00.000Z', 'web'),
                ($1, $2, 'clock_out', '2026-07-06T10:00:00.000Z', 'web')`,
        [TENANT, emp],
      ),
    );

    // Ohne Mapping-Eintrag: Kategorie wird NICHT still exportiert.
    const before = await asTenant(() => exportService.runPayroll('2026-07-01', '2026-07-31'));
    expect(before.rowCount).toBe(0);
    expect(before.unmapped.map((u) => u.category)).toContain('work_time');

    // Admin pflegt das Mapping (persistiert, mandantenspezifisch).
    await asTenant(() => mappings.set({ category: 'work_time', lohnart: '100' }));
    const first = await asTenant(() => exportService.runPayroll('2026-07-01', '2026-07-31'));
    expect(first.content).toContain('PM-1001,work_time,100');

    // Aenderung ohne Deployment: neuer Wert wirkt beim naechsten Export.
    await asTenant(() =>
      mappings.set({ category: 'work_time', lohnart: '150', factorPercent: 60 }),
    );
    const second = await asTenant(() => exportService.runPayroll('2026-07-01', '2026-07-31'));
    expect(second.content).toContain('PM-1001,work_time,150');
    expect(second.content).not.toContain(',100,');
    // C-09: eigener Verguetungsfaktor je Kategorie wird als Spalte mitgefuehrt
    // (die Minuten bleiben die ECHTEN Minuten - keine stille Skalierung).
    const line = second.content.split('\n').find((l) => l.includes('PM-1001'))!;
    expect(line.split(',').at(-1)).toBe('60');

    const list = await asTenant(() => mappings.list());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ category: 'work_time', lohnart: '150', factorPercent: 60 });
  });

  it('RLS: Mapping ist mandantengetrennt', async () => {
    await asTenant(() => mappings.set({ category: 'travel', lohnart: '230' }));
    const fromB = await withTenant(pool, TENANT_B, (c) =>
      c.query('select id from payroll_mappings'),
    );
    expect(fromB.rowCount).toBe(0);
  });
});
