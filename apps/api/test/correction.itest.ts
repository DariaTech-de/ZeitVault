import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const stamp = Date.now();
const TENANT_A = `itest-cor-a-${stamp}`;
const TENANT_B = `itest-cor-b-${stamp}`;
const EMP = '00000000-0000-4000-8000-00000000000c';

async function insertRequest(tenantId: string): Promise<string> {
  return withTenant(pool, tenantId, async (c) => {
    const res = await c.query<{ id: string }>(
      `insert into stamp_correction_requests
         (tenant_id, employee_id, kind, proposed_kind, proposed_occurred_at, reason)
       values ($1, $2, 'add', 'clock_out', '2026-06-22T16:30:00Z', 'Ausstempeln vergessen')
       returning id`,
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

describe('Anpassungsanträge – RLS & Workflow (Integration)', () => {
  it('jeder Mandant sieht nur eigene Anträge', async () => {
    await insertRequest(TENANT_A);
    await insertRequest(TENANT_B);
    const aSeesB = await withTenant(pool, TENANT_A, async (c) =>
      (
        await c.query<{ n: number }>(
          'select count(*)::int as n from stamp_correction_requests where tenant_id = $1',
          [TENANT_B],
        )
      ).rows[0]?.n,
    );
    expect(aSeesB).toBe(0);
  });

  it('Statuswechsel (Freigabe) ist erlaubt – Workflow-Entität', async () => {
    const id = await insertRequest(TENANT_A);
    const status = await withTenant(pool, TENANT_A, async (c) => {
      await c.query("update stamp_correction_requests set status = 'approved', decided_at = now() where id = $1", [id]);
      return (
        await c.query<{ status: string }>('select status from stamp_correction_requests where id = $1', [id])
      ).rows[0]?.status;
    });
    expect(status).toBe('approved');
  });

  it('Insert mit fremdem tenant_id wird durch WITH CHECK abgelehnt', async () => {
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query(
          `insert into stamp_correction_requests
             (tenant_id, employee_id, kind, proposed_kind, proposed_occurred_at, reason)
           values ($1, $2, 'add', 'clock_in', now(), 'x')`,
          [TENANT_B, EMP],
        ),
      ),
    ).rejects.toThrow();
  });
});
