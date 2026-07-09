import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { isHolidayAtLocation } from '@zeitvault/domain';
import type { Bundesland } from '@zeitvault/domain';
import type { AuditClient } from '../src/audit/audit.client';
import { TenantContextService } from '../src/common/tenant-context.service';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/tokens';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { makePool, runMigrations, withTenant } from './db';

// C-08: Feiertagskalender pro Bundesland und pro EINSATZORT - nicht pro
// Mandant. Die Gemeinde-Schluessel werden am Einsatzort persistiert und bei
// der Aufloesung mitgeliefert; die Bewertung (isHolidayAtLocation) haengt
// damit am aufgeloesten Einsatzort.
const stamp = Date.now();
const TENANT = `itest-wlhol-${stamp}`;

let pool: Pool;
let workLocations: WorkLocationService;
let tenantContext: TenantContextService;

const auditStub = { append: async () => undefined } as unknown as AuditClient;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
  const db = drizzle(pool, { schema }) as unknown as Database;
  tenantContext = new TenantContextService();
  workLocations = new WorkLocationService(db, tenantContext, auditStub);
});

afterAll(async () => {
  await pool.end();
});

function asTenant<T>(fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId: TENANT, userId: 'itest', roles: ['admin'] }, fn);
}

// Fronleichnam 2026: Ostersonntag 05.04. + 60 Tage.
const FRONLEICHNAM_2026 = '2026-06-04';

describe('C-08: Einsatzort traegt Bundesland + Gemeinde-Schluessel (persistiert)', () => {
  it('AK: derselbe Mandant unterscheidet BY (Feiertag) und SN (keiner); SN mit Schluessel -> Feiertag', async () => {
    const by = await asTenant(() =>
      workLocations.create({
        name: 'Werk Muenchen',
        countryCode: 'DE',
        stateCode: 'BY',
        timeZone: 'Europe/Berlin',
        isDefault: true,
      }),
    );
    const sn = await asTenant(() =>
      workLocations.create({
        name: 'Werk Leipzig',
        countryCode: 'DE',
        stateCode: 'SN',
        timeZone: 'Europe/Berlin',
        isDefault: false,
      }),
    );
    const snSorbisch = await asTenant(() =>
      workLocations.create({
        name: 'Werk Ostritz',
        countryCode: 'DE',
        stateCode: 'SN',
        municipalHolidayKeys: ['fronleichnam'],
        timeZone: 'Europe/Berlin',
        isDefault: false,
      }),
    );
    expect(snSorbisch.municipalHolidayKeys).toEqual(['fronleichnam']);

    const emp = await withTenant(pool, TENANT, (c) =>
      c.query(
        `insert into employees (tenant_id, personnel_number, display_name)
         values ($1, 'HOL-1001', 'Feiertag Probe') returning id`,
        [TENANT],
      ),
    ).then((r) => r.rows[0].id as string);

    // Aufloesung liefert die Schluessel mit; Bewertung je Einsatzort.
    for (const [locId, expected] of [
      [by.id, true],
      [sn.id, false],
      [snSorbisch.id, true],
    ] as const) {
      const resolved = await asTenant(() => workLocations.resolve(emp, FRONLEICHNAM_2026, locId));
      expect(
        isHolidayAtLocation(FRONLEICHNAM_2026, {
          stateCode: resolved.stateCode as Bundesland | null,
          municipalHolidayKeys: resolved.municipalHolidayKeys,
        }),
      ).toBe(expected);
    }
  });
});
