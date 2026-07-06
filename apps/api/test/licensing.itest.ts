import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const stamp = Date.now();
const TENANT_A = `itest-lic-a-${stamp}`;
const TENANT_B = `itest-lic-b-${stamp}`;

async function insertLicense(tenantId: string, seats = 10): Promise<void> {
  await withTenant(pool, tenantId, (c) =>
    c.query(
      `insert into licenses (tenant_id, license_id, customer, tier, seats, issued_at, valid_until, token)
       values ($1, gen_random_uuid(), 'Muster GmbH', 'Team', $2, now(), now() + interval '365 days', 'tok')
       on conflict (tenant_id) do update set seats = excluded.seats`,
      [tenantId, seats],
    ),
  );
}

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
});
afterAll(async () => {
  await pool.end();
});

describe('Lizenzierung – RLS, Upsert & Sitzplatzzählung (Integration)', () => {
  it('jeder Mandant sieht nur die eigene Lizenz (RLS)', async () => {
    await insertLicense(TENANT_A, 10);
    await insertLicense(TENANT_B, 20);
    const aSeesB = await withTenant(pool, TENANT_A, async (c) =>
      (await c.query<{ n: number }>('select count(*)::int as n from licenses where tenant_id = $1', [TENANT_B]))
        .rows[0]?.n,
    );
    expect(aSeesB).toBe(0);
  });

  it('Insert mit fremdem tenant_id wird durch WITH CHECK abgelehnt', async () => {
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query(
          `insert into licenses (tenant_id, license_id, customer, tier, seats, issued_at, valid_until, token)
           values ($1, gen_random_uuid(), 'X', 'Y', 5, now(), now() + interval '1 day', 't')`,
          [TENANT_B],
        ),
      ),
    ).rejects.toThrow();
  });

  it('genau eine Lizenz je Mandant (Upsert auf tenant_id)', async () => {
    await insertLicense(TENANT_A, 10);
    await insertLicense(TENANT_A, 15); // Upsert
    const row = await withTenant(pool, TENANT_A, async (c) =>
      (await c.query<{ seats: number; n: number }>(
        'select seats, (select count(*)::int from licenses where tenant_id = $1) as n from licenses where tenant_id = $1',
        [TENANT_A],
      )).rows[0],
    );
    expect(row?.n).toBe(1);
    expect(row?.seats).toBe(15);
  });

  it('Sitzplatzzählung erfasst nur aktive Mitarbeitende', async () => {
    const T = `itest-lic-seats-${stamp}`;
    await withTenant(pool, T, async (c) => {
      await c.query(
        "insert into employees (tenant_id, personnel_number, display_name, status) values ($1, 'S1', 'Aktiv Eins', 'active')",
        [T],
      );
      await c.query(
        "insert into employees (tenant_id, personnel_number, display_name, status) values ($1, 'S2', 'Aktiv Zwei', 'active')",
        [T],
      );
      await c.query(
        "insert into employees (tenant_id, personnel_number, display_name, status) values ($1, 'S3', 'Gesperrt', 'blocked')",
        [T],
      );
    });
    const active = await withTenant(pool, T, async (c) =>
      (await c.query<{ n: number }>(
        "select count(*)::int as n from employees where tenant_id = $1 and status = 'active'",
        [T],
      )).rows[0]?.n,
    );
    expect(active).toBe(2);
  });
});
