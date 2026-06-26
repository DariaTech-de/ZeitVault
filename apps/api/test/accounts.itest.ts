import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const stamp = Date.now();
const TENANT_A = `itest-acc-a-${stamp}`;
const TENANT_B = `itest-acc-b-${stamp}`;
const EMP = '00000000-0000-4000-8000-000000000002';

async function insertTx(tenantId: string, amount: number): Promise<string> {
  return withTenant(pool, tenantId, async (c) => {
    const res = await c.query<{ id: string }>(
      `insert into account_transactions (tenant_id, employee_id, account, amount, effective_date)
       values ($1, $2, 'overtime', $3, '2026-06-01') returning id`,
      [tenantId, EMP, amount],
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

describe('Arbeitszeitkonten – RLS & Append-only (Integration, echtes Postgres)', () => {
  it('jeder Mandant sieht nur eigene Buchungen', async () => {
    await insertTx(TENANT_A, 120);
    await insertTx(TENANT_B, 60);
    const aSeesB = await withTenant(pool, TENANT_A, async (c) =>
      (
        await c.query<{ n: number }>(
          'select count(*)::int as n from account_transactions where tenant_id = $1',
          [TENANT_B],
        )
      ).rows[0]?.n,
    );
    expect(aSeesB).toBe(0);
  });

  it('UPDATE einer Buchung wird per Trigger verhindert (append-only)', async () => {
    const id = await insertTx(TENANT_A, 30);
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query('update account_transactions set amount = 999 where id = $1', [id]),
      ),
    ).rejects.toThrow();
  });

  it('DELETE einer Buchung wird per Trigger verhindert (append-only)', async () => {
    const id = await insertTx(TENANT_A, 15);
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query('delete from account_transactions where id = $1', [id]),
      ),
    ).rejects.toThrow();
  });

  it('Insert mit fremdem tenant_id wird durch WITH CHECK abgelehnt', async () => {
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query(
          `insert into account_transactions (tenant_id, employee_id, account, amount, effective_date)
           values ($1, $2, 'vacation', 30, '2026-01-01')`,
          [TENANT_B, EMP],
        ),
      ),
    ).rejects.toThrow();
  });
});
