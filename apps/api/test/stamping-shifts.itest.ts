import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { BadRequestException } from '@nestjs/common';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { GeofenceService } from '../src/geofence/geofence.service';
import { RuleResolutionService } from '../src/rules/rule-resolution.service';
import { StampingService } from '../src/stamping/stamping.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// Service-Level-Akzeptanztests fuer Schnitt 1 gegen die ECHTE Datenbank:
//  - K-02: Nachtschicht ueber Mitternacht ist erfassbar (frueher 409).
//  - K-01: DST-Nachtschicht ergibt die tatsaechlich geleistete Zeit (7 h).
//  - A-03: Nacherfassung > 24 h nur mit Begruendung; Eintrag wird markiert.
const stamp = Date.now();
const TENANT = `itest-shift-${stamp}`;

let pool: Pool;
let stamping: StampingService;
let tenantContext: TenantContextService;
let employeeId: string;

/** Der Audit-Trail laeuft ueber den getrennten Ledger-Dienst; hier gestubbt. */
const auditStub = { append: async () => undefined } as unknown as AuditClient;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
  const db = drizzle(pool, { schema }) as unknown as Database;
  tenantContext = new TenantContextService();
  const geofence = new GeofenceService(db, tenantContext, auditStub);
  const workLocations = new WorkLocationService(db, tenantContext, auditStub);
  const rules = new RuleResolutionService(db, tenantContext);
  stamping = new StampingService(db, tenantContext, auditStub, geofence, workLocations, rules);

  // Standard-Einsatzort ist Pflicht-Stammdatum: ohne ihn wirft resolve()
  // (bewusst kein Zeitzonen-Fallback).
  await tenantContext.run({ tenantId: TENANT, userId: 'itest', roles: ['admin'] }, () =>
    workLocations.create({
      name: 'Werk Muenchen',
      countryCode: 'DE',
      stateCode: 'BY',
      timeZone: 'Europe/Berlin',
      isDefault: true,
    }),
  );

  const emp = await withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into employees (tenant_id, personnel_number, display_name)
       values ($1, 'SHIFT-1001', 'Nachtschicht Probe') returning id`,
      [TENANT],
    ),
  );
  employeeId = emp.rows[0].id;
});

afterAll(async () => {
  await pool.end();
});

function asTenant<T>(fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId: TENANT, userId: 'itest', roles: ['admin'] }, fn);
}

describe('K-02: Nachtschicht ueber Mitternacht', () => {
  it('clock_in 22:00 und clock_out 06:00 des Folgetags werden akzeptiert (eine Schicht)', async () => {
    // Vergangenheit > 24 h -> Nacherfassung mit Pflicht-Begruendung (A-03).
    await asTenant(() =>
      stamping.stamp({
        employeeId,
        kind: 'clock_in',
        source: 'web',
        occurredAt: '2026-01-31T21:00:00.000Z', // lokal 31.01. 22:00 Berlin
        reason: 'Nacherfassung Testschicht',
      }),
    );
    const result = await asTenant(() =>
      stamping.stamp({
        employeeId,
        kind: 'clock_out',
        source: 'web',
        occurredAt: '2026-02-01T05:00:00.000Z', // lokal 01.02. 06:00 Berlin
        reason: 'Nacherfassung Testschicht',
      }),
    );
    // Frueher: StampTransitionError/409 ("Ausstempeln nur im Status eingestempelt").
    expect(result.status.workedMinutes).toBe(8 * 60);
  });
});

describe('K-01: Sommerzeitumstellung', () => {
  it('Schicht lokal 22:00-06:00 in der Umstellungsnacht ergibt 7 h, nicht 8 h', async () => {
    await asTenant(() =>
      stamping.stamp({
        employeeId,
        kind: 'clock_in',
        source: 'web',
        occurredAt: '2026-03-28T21:00:00.000Z', // lokal 22:00 CET
        reason: 'Nacherfassung DST-Test',
      }),
    );
    const result = await asTenant(() =>
      stamping.stamp({
        employeeId,
        kind: 'clock_out',
        source: 'web',
        occurredAt: '2026-03-29T04:00:00.000Z', // lokal 06:00 CEST
        reason: 'Nacherfassung DST-Test',
      }),
    );
    expect(result.status.workedMinutes).toBe(7 * 60);
  });
});

describe('A-03: Nacherfassung', () => {
  it('Nacherfassung > 24 h OHNE Begruendung wird abgelehnt', async () => {
    await expect(
      asTenant(() =>
        stamping.stamp({
          employeeId,
          kind: 'clock_in',
          source: 'web',
          occurredAt: '2026-05-04T06:00:00.000Z',
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('Nacherfassung MIT Begruendung wird dauerhaft als late_entry markiert', async () => {
    const result = await asTenant(() =>
      stamping.stamp({
        employeeId,
        kind: 'clock_in',
        source: 'web',
        occurredAt: '2026-05-04T06:00:00.000Z',
        reason: 'Stempeluhr defekt, Nachtrag laut Schichtplan',
      }),
    );
    const row = await withTenant(pool, TENANT, (c) =>
      c.query('select late_entry, late_reason from stamp_events where id = $1', [result.event.id]),
    );
    expect(row.rows[0].late_entry).toBe(true);
    expect(row.rows[0].late_reason).toContain('Stempeluhr defekt');
  });

  it('zeitnahe Stempelung braucht keine Begruendung und ist nicht markiert', async () => {
    const fresh = await freshEmployee();
    const result = await asTenant(() =>
      stamping.stamp({ employeeId: fresh, kind: 'clock_in', source: 'web' }),
    );
    const row = await withTenant(pool, TENANT, (c) =>
      c.query('select late_entry from stamp_events where id = $1', [result.event.id]),
    );
    expect(row.rows[0].late_entry).toBe(false);
  });
});

async function freshEmployee(): Promise<string> {
  const emp = await withTenant(pool, TENANT, (c) =>
    c.query(
      `insert into employees (tenant_id, personnel_number, display_name)
       values ($1, 'SHIFT-${Math.floor(Math.random() * 1e9)}', 'Frisch Probe') returning id`,
      [TENANT],
    ),
  );
  return emp.rows[0].id;
}
