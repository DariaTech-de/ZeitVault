import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { GeofenceService } from '../src/geofence/geofence.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { StampingService } from '../src/stamping/stamping.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// B-13: Die Verstosspruefung laeuft beim ERFASSEN; der Mitarbeitende sieht
// die Befunde in der Stempel-Antwort, die Fuehrungskraft erhaelt sie
// zusaetzlich in ihrer Benachrichtigungs-Inbox - nicht erst im Monatsbericht.
const stamp = Date.now();
const TENANT = `itest-notif-${stamp}`;

let pool: Pool;
let stamping: StampingService;
let notifications: NotificationsService;
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
  notifications = new NotificationsService(db, tenantContext);
  stamping = new StampingService(db, tenantContext, auditStub, geofence, workLocations, resolution, notifications);

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

describe('B-13: Verstosswarnung erreicht die Fuehrungskraft beim Erfassen', () => {
  it('Ruhezeitverstoss beim Stempeln erzeugt sofort eine Inbox-Warnung; gelesen = raus', async () => {
    const emp = await withTenant(pool, TENANT, (c) =>
      c.query(
        `insert into employees (tenant_id, personnel_number, display_name)
         values ($1, 'NT-1001', 'Warnung Probe') returning id`,
        [TENANT],
      ),
    ).then((r) => r.rows[0].id as string);

    for (const [kind, at] of [
      ['clock_in', '2026-06-22T06:00:00.000Z'],
      ['clock_out', '2026-06-22T20:00:00.000Z'], // 22:00 lokal
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
    // Wiedereinstieg am Folgetag nach nur 6 h Ruhe -> Ruhezeitverstoss
    // BEIM ERFASSEN.
    const result = await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'clock_in',
        source: 'web',
        occurredAt: '2026-06-23T02:00:00.000Z', // 04:00 lokal
        reason: 'Nacherfassung Testschicht',
      }),
    );
    // Mitarbeitenden-Seite: Befund in der Antwort (Live-Pruefung).
    expect(result.findings.map((f) => f.code)).toContain('REST_PERIOD_TOO_SHORT');

    // Fuehrungskraft-Seite: Warnung in der Inbox.
    const open = await asTenant(() => notifications.listOpen());
    const mine = open.filter((n) => n.employeeId === emp);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(mine.map((n) => n.code)).toContain('REST_PERIOD_TOO_SHORT');

    await asTenant(() => notifications.markRead(mine[0]!.id));
    const after = await asTenant(() => notifications.listOpen());
    expect(after.find((n) => n.id === mine[0]!.id)).toBeUndefined();
  });
});
