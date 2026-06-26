import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const stamp = Date.now();
const TENANT_A = `itest-a-${stamp}`;
const TENANT_B = `itest-b-${stamp}`;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
});
afterAll(async () => {
  await pool.end();
});

describe('RLS-Mandantentrennung (Integration, echtes Postgres)', () => {
  it('jeder Mandant sieht nur eigene Zeilen', async () => {
    await withTenant(pool, TENANT_A, (c) =>
      c.query(
        "insert into employees (tenant_id, personnel_number, display_name) values ($1, 'A-001', 'Mitarbeiter A')",
        [TENANT_A],
      ),
    );
    await withTenant(pool, TENANT_B, (c) =>
      c.query(
        "insert into employees (tenant_id, personnel_number, display_name) values ($1, 'B-001', 'Mitarbeiter B')",
        [TENANT_B],
      ),
    );

    const aSeesB = await withTenant(pool, TENANT_A, async (c) =>
      (
        await c.query<{ n: number }>(
          'select count(*)::int as n from employees where tenant_id = $1',
          [TENANT_B],
        )
      ).rows[0]?.n,
    );
    const bSeesA = await withTenant(pool, TENANT_B, async (c) =>
      (
        await c.query<{ n: number }>(
          'select count(*)::int as n from employees where tenant_id = $1',
          [TENANT_A],
        )
      ).rows[0]?.n,
    );
    const aSeesA = await withTenant(pool, TENANT_A, async (c) =>
      (
        await c.query<{ n: number }>(
          'select count(*)::int as n from employees where tenant_id = $1',
          [TENANT_A],
        )
      ).rows[0]?.n,
    );

    expect(aSeesB).toBe(0);
    expect(bSeesA).toBe(0);
    expect(aSeesA).toBeGreaterThanOrEqual(1);
  });

  it('Insert mit fremdem tenant_id wird durch WITH CHECK abgelehnt', async () => {
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query(
          "insert into employees (tenant_id, personnel_number, display_name) values ($1, 'X', 'X')",
          [TENANT_B],
        ),
      ),
    ).rejects.toThrow();
  });

  it('ohne Tenant-Kontext sind keine Zeilen sichtbar (FORCE RLS)', async () => {
    const client = await pool.connect();
    try {
      const n = (await client.query<{ n: number }>('select count(*)::int as n from employees'))
        .rows[0]?.n;
      expect(n).toBe(0);
    } finally {
      client.release();
    }
  });
});
