import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const stamp = Date.now();
const TENANT_A = `itest-exp-a-${stamp}`;
const TENANT_B = `itest-exp-b-${stamp}`;

async function insertJob(tenantId: string): Promise<string> {
  return withTenant(pool, tenantId, async (c) => {
    const res = await c.query<{ id: string }>(
      `insert into export_jobs
         (tenant_id, kind, period_from, period_to, format, row_count, checksum, requested_by)
       values ($1, 'gobd_time', '2026-06-01', '2026-06-30', 'csv', 3, 'abc123', 'admin-1')
       returning id`,
      [tenantId],
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

describe('ExportJobs – RLS & Append-only (Integration, echtes Postgres)', () => {
  it('jeder Mandant sieht nur eigene Exporte', async () => {
    await insertJob(TENANT_A);
    await insertJob(TENANT_B);
    const aSeesB = await withTenant(pool, TENANT_A, async (c) =>
      (
        await c.query<{ n: number }>(
          'select count(*)::int as n from export_jobs where tenant_id = $1',
          [TENANT_B],
        )
      ).rows[0]?.n,
    );
    expect(aSeesB).toBe(0);
  });

  it('UPDATE wird per Trigger verhindert (append-only)', async () => {
    const id = await insertJob(TENANT_A);
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query("update export_jobs set checksum = 'tampered' where id = $1", [id]),
      ),
    ).rejects.toThrow();
  });

  it('DELETE wird per Trigger verhindert (append-only)', async () => {
    const id = await insertJob(TENANT_A);
    await expect(
      withTenant(pool, TENANT_A, (c) => c.query('delete from export_jobs where id = $1', [id])),
    ).rejects.toThrow();
  });
});
