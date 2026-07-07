import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const stamp = Date.now();
const TENANT_A = `itest-geo-a-${stamp}`;
const TENANT_B = `itest-geo-b-${stamp}`;
const EMP = '00000000-0000-4000-8000-00000000000d';

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
});
afterAll(async () => {
  await pool.end();
});

describe('Geofencing – RLS, Default-AUS & Append-only-Standort (Integration)', () => {
  it('Geofencing ist ohne Eintrag standardmäßig deaktiviert (Kern-Invariante 5)', async () => {
    const enabled = await withTenant(pool, TENANT_A, async (c) =>
      (
        await c.query<{ enabled: boolean }>('select enabled from geofence_settings where tenant_id = $1', [TENANT_A])
      ).rows[0]?.enabled,
    );
    // Kein Datensatz => in der Anwendung false. Hier: es existiert kein Eintrag.
    expect(enabled).toBeUndefined();
  });

  it('Standorte sind mandantengetrennt (RLS)', async () => {
    await withTenant(pool, TENANT_A, (c) =>
      c.query(
        "insert into geofence_sites (tenant_id, name, latitude, longitude, radius_m) values ($1, 'Zentrale', 52.52, 13.40, 100)",
        [TENANT_A],
      ),
    );
    await withTenant(pool, TENANT_B, (c) =>
      c.query(
        "insert into geofence_sites (tenant_id, name, latitude, longitude, radius_m) values ($1, 'Werk', 48.13, 11.58, 150)",
        [TENANT_B],
      ),
    );
    const aSeesB = await withTenant(pool, TENANT_A, async (c) =>
      (await c.query<{ n: number }>('select count(*)::int as n from geofence_sites where tenant_id = $1', [TENANT_B]))
        .rows[0]?.n,
    );
    expect(aSeesB).toBe(0);
  });

  it('Site-Insert mit fremdem tenant_id wird durch WITH CHECK abgelehnt', async () => {
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query(
          "insert into geofence_sites (tenant_id, name, latitude, longitude, radius_m) values ($1, 'X', 1, 1, 50)",
          [TENANT_B],
        ),
      ),
    ).rejects.toThrow();
  });

  it("Stempel tragen standardmäßig location_check = 'not_required'", async () => {
    const check = await withTenant(pool, TENANT_A, async (c) => {
      await c.query(
        "insert into stamp_events (tenant_id, employee_id, kind, occurred_at, source) values ($1, $2, 'clock_in', now(), 'web')",
        [TENANT_A, EMP],
      );
      return (
        await c.query<{ location_check: string }>(
          'select location_check from stamp_events where tenant_id = $1 and employee_id = $2 limit 1',
          [TENANT_A, EMP],
        )
      ).rows[0]?.location_check;
    });
    expect(check).toBe('not_required');
  });

  it('Stempel-Kennzeichnungen (stamp_flags) sind mandantengetrennt', async () => {
    const eventId = await withTenant(pool, TENANT_A, async (c) =>
      (
        await c.query<{ event_id: string }>(
          "insert into stamp_flags (event_id, tenant_id, flagged, reason) values (gen_random_uuid(), $1, true, 'außerhalb') returning event_id",
          [TENANT_A],
        )
      ).rows[0]?.event_id,
    );
    const bSeesA = await withTenant(pool, TENANT_B, async (c) =>
      (await c.query<{ n: number }>('select count(*)::int as n from stamp_flags where event_id = $1', [eventId]))
        .rows[0]?.n,
    );
    expect(bSeesA).toBe(0);
  });
});
