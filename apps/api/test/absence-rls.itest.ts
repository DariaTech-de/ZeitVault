import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const stamp = Date.now();
const TENANT_A = `itest-abs-a-${stamp}`;
const TENANT_B = `itest-abs-b-${stamp}`;
const EMP = '00000000-0000-4000-8000-000000000001';

async function insertRequest(tenantId: string): Promise<string> {
  return withTenant(pool, tenantId, async (c) => {
    const res = await c.query<{ id: string }>(
      `insert into absence_requests (tenant_id, employee_id, type, from_date, to_date)
       values ($1, $2, 'vacation', '2026-07-06', '2026-07-10') returning id`,
      [tenantId, EMP],
    );
    return res.rows[0]!.id;
  });
}

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
});
afterAll(async () => {
  await pool.end();
});

describe('Abwesenheiten – RLS-Mandantentrennung (Integration, echtes Postgres)', () => {
  it('jeder Mandant sieht nur eigene Abwesenheitsantraege', async () => {
    await insertRequest(TENANT_A);
    await insertRequest(TENANT_B);

    const aSeesB = await withTenant(pool, TENANT_A, async (c) =>
      (
        await c.query<{ n: number }>(
          'select count(*)::int as n from absence_requests where tenant_id = $1',
          [TENANT_B],
        )
      ).rows[0]?.n,
    );
    const aSeesA = await withTenant(pool, TENANT_A, async (c) =>
      (
        await c.query<{ n: number }>(
          'select count(*)::int as n from absence_requests where tenant_id = $1',
          [TENANT_A],
        )
      ).rows[0]?.n,
    );

    expect(aSeesB).toBe(0);
    expect(aSeesA).toBeGreaterThanOrEqual(1);
  });

  it('Insert mit fremdem tenant_id wird durch WITH CHECK abgelehnt', async () => {
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query(
          `insert into absence_requests (tenant_id, employee_id, type, from_date, to_date)
           values ($1, $2, 'sick', '2026-07-06', '2026-07-10')`,
          [TENANT_B, EMP],
        ),
      ),
    ).rejects.toThrow();
  });

  it('CHECK from_date <= to_date wird erzwungen', async () => {
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query(
          `insert into absence_requests (tenant_id, employee_id, type, from_date, to_date)
           values ($1, $2, 'sick', '2026-07-10', '2026-07-06')`,
          [TENANT_A, EMP],
        ),
      ),
    ).rejects.toThrow();
  });

  it('Statuswechsel (UPDATE) ist erlaubt – Workflow-Entitaet, NICHT append-only', async () => {
    const id = await insertRequest(TENANT_A);
    const status = await withTenant(pool, TENANT_A, async (c) => {
      await c.query("update absence_requests set status = 'approved' where id = $1", [id]);
      return (
        await c.query<{ status: string }>('select status from absence_requests where id = $1', [id])
      ).rows[0]?.status;
    });
    expect(status).toBe('approved');
  });
});
