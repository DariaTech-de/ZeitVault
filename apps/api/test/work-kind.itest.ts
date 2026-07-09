import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { ExportService } from '../src/export/export.service';
import { GeofenceService } from '../src/geofence/geofence.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { StampingService } from '../src/stamping/stamping.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// C-09: Bewertungsarten Ende-zu-Ende - Persistenz am clock_in, getrennte
// Payroll-Kategorien (eigene Lohnart je Art) und Validierung.
const stamp = Date.now();
const TENANT = `itest-wk-${stamp}`;

let pool: Pool;
let stamping: StampingService;
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
  const notifications = new NotificationsService(db, tenantContext);
  stamping = new StampingService(db, tenantContext, auditStub, geofence, workLocations, rules, notifications);
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

describe('C-09: eigene Lohnart je Bewertungsart im Lohnexport', () => {
  it('Vollarbeit, Bereitschaftsdienst, Rufbereitschaft und Reisezeit landen auf getrennten Lohnarten', async () => {
    const emp = await withTenant(pool, TENANT, (c) =>
      c.query(
        `insert into employees (tenant_id, personnel_number, display_name)
         values ($1, 'WK-1001', 'Bewertungsart Probe') returning id`,
        [TENANT],
      ),
    ).then((r) => r.rows[0].id as string);

    const days: ReadonlyArray<
      readonly [string, 'full_work' | 'on_call_duty' | 'standby' | 'travel' | undefined]
    > = [
      ['2026-07-06', undefined], // Vollarbeit (Default)
      ['2026-07-07', 'on_call_duty'],
      ['2026-07-08', 'standby'],
      ['2026-07-09', 'travel'],
    ];
    for (const [day, workKind] of days) {
      await asTenant(() =>
        stamping.stamp({
          employeeId: emp,
          kind: 'clock_in',
          source: 'web',
          occurredAt: `${day}T06:00:00.000Z`,
          reason: 'Nacherfassung Testschicht',
          ...(workKind ? { workKind } : {}),
        }),
      );
      await asTenant(() =>
        stamping.stamp({
          employeeId: emp,
          kind: 'clock_out',
          source: 'web',
          occurredAt: `${day}T10:00:00.000Z`,
          reason: 'Nacherfassung Testschicht',
        }),
      );
    }

    const result = await asTenant(() =>
      exportService.runPayroll('2026-07-01', '2026-07-31', {
        work_time: { lohnart: '100' },
        on_call_duty: { lohnart: '210' },
        standby: { lohnart: '220' },
        travel: { lohnart: '230' },
      }),
    );
    const lines = result.content
      .trim()
      .split('\n')
      .filter((l) => l.includes('WK-1001'));
    const byCategory = new Map(
      lines.map((l) => {
        const [, category, lohnart, , , value] = l.split(',');
        return [category, { lohnart, value }];
      }),
    );
    expect(byCategory.get('work_time')).toEqual({ lohnart: '100', value: '240' });
    expect(byCategory.get('on_call_duty')).toEqual({ lohnart: '210', value: '240' });
    expect(byCategory.get('standby')).toEqual({ lohnart: '220', value: '240' });
    expect(byCategory.get('travel')).toEqual({ lohnart: '230', value: '240' });
  });

  it('workKind an einem Nicht-clock_in-Ereignis wird abgewiesen (400)', async () => {
    const emp = await withTenant(pool, TENANT, (c) =>
      c.query(
        `insert into employees (tenant_id, personnel_number, display_name)
         values ($1, 'WK-1002', 'Validierung Probe') returning id`,
        [TENANT],
      ),
    ).then((r) => r.rows[0].id as string);
    await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'clock_in',
        source: 'web',
        occurredAt: '2026-07-06T06:00:00.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );
    await expect(
      asTenant(() =>
        stamping.stamp({
          employeeId: emp,
          kind: 'clock_out',
          source: 'web',
          occurredAt: '2026-07-06T10:00:00.000Z',
          reason: 'Nacherfassung Testschicht',
          workKind: 'travel',
        }),
      ),
    ).rejects.toThrow(/clock_in/);
  });
});
