import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ConflictException } from '@nestjs/common';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { GeofenceService } from '../src/geofence/geofence.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ReprocessingService } from '../src/rules/reprocessing.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { RulesService } from '../src/rules/rules.service';
import { StampingService } from '../src/stamping/stamping.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// B-12: Rundung ist eine Regel am EREIGNIS - pro Mandant ueber einen
// BV-Regelsatz gesetzt (mitbestimmungspflichtig), Standard IMMER 'none',
// und im Audit-Trail sichtbar (Modus + Roh-Zeitstempel).
const stamp = Date.now();
const TENANT = `itest-round-${stamp}`;

let pool: Pool;
let rules: RulesService;
let stamping: StampingService;
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
  const reprocessing = new ReprocessingService(db, tenantContext, auditStub, resolution, workLocations);
  rules = new RulesService(db, tenantContext, auditStub, reprocessing);
  const notificationsSvc = new NotificationsService(db, tenantContext);
  stamping = new StampingService(db, tenantContext, auditStub, geofence, workLocations, resolution, notificationsSvc);

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
       values ($1, 'RD-${Math.floor(Math.random() * 1e9)}', 'Rundung Probe') returning id`,
      [TENANT],
    ),
  );
  return emp.rows[0].id;
}

async function occurredAtOf(eventId: string): Promise<string> {
  const row = await withTenant(pool, TENANT, (c) =>
    c.query('select occurred_at from stamp_events where id = $1', [eventId]),
  );
  return (row.rows[0].occurred_at as Date).toISOString();
}

describe('B-12: Rundungsmodus pro Mandant ueber die Regelschicht', () => {
  it('Standard ist keine Rundung: Sekunden bleiben erhalten', async () => {
    const emp = await freshEmployee();
    const r = await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'clock_in',
        source: 'web',
        occurredAt: '2026-06-15T06:07:30.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );
    expect(await occurredAtOf(r.event.id)).toBe('2026-06-15T06:07:30.000Z');
  });

  it('BV-Regelsatz setzt Modi (asymmetrisch abbildbar); Stempel werden gerundet und der Trail zeigt es', async () => {
    const bv = await asTenant(() =>
      rules.createAgreement({
        kind: 'works_agreement',
        name: `BV Zeiterfassung ${stamp}`,
        reference: 'BV Zeiterfassung § 5 (Rundung)',
        validFrom: '2026-01-01',
      }),
    );
    await asTenant(() =>
      rules.createRuleSet({
        name: 'BV-Rundung',
        layer: 'works_agreement',
        collectiveAgreementId: bv.id,
        validFrom: '2026-01-01',
        params: { roundingClockIn: 'nearest_minute', roundingClockOut: 'down_minute' },
      }),
    );

    const emp = await freshEmployee();
    auditEvents.length = 0;
    const cin = await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'clock_in',
        source: 'web',
        occurredAt: '2026-06-16T06:07:30.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );
    expect(await occurredAtOf(cin.event.id)).toBe('2026-06-16T06:08:00.000Z');

    // Pausen bleiben ohne konfigurierten Modus ungerundet.
    const bs = await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'break_start',
        source: 'web',
        occurredAt: '2026-06-16T10:00:20.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );
    expect(await occurredAtOf(bs.event.id)).toBe('2026-06-16T10:00:20.000Z');
    await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'break_end',
        source: 'web',
        occurredAt: '2026-06-16T10:30:20.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );

    const cout = await asTenant(() =>
      stamping.stamp({
        employeeId: emp,
        kind: 'clock_out',
        source: 'web',
        occurredAt: '2026-06-16T14:03:50.000Z',
        reason: 'Nacherfassung Testschicht',
      }),
    );
    expect(await occurredAtOf(cout.event.id)).toBe('2026-06-16T14:03:00.000Z');

    // Audit-Sichtbarkeit: Modus + Roh-Zeitstempel im Ledger-Payload.
    const cinAudit = auditEvents.find((e) => e.action === 'time.clock_in');
    expect(cinAudit?.payload.rounding).toBe('nearest_minute');
    expect(cinAudit?.payload.rawOccurredAt).toBe('2026-06-16T06:07:30.000Z');
    const coutAudit = auditEvents.find((e) => e.action === 'time.clock_out');
    expect(coutAudit?.payload.rounding).toBe('down_minute');

  });

  it('Rundungsmodi sind mitbestimmungspflichtig: individuell -> 409', async () => {
    const emp = await freshEmployee();
    await expect(
      asTenant(() =>
        rules.createRuleSet({
          name: 'Individuelle Rundung',
          layer: 'individual',
          employeeId: emp,
          validFrom: '2026-01-01',
          params: { roundingClockIn: 'up_minute' },
        }),
      ),
    ).rejects.toThrow(ConflictException);
  });
});
