import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const stamp = Date.now();
const TENANT_A = `itest-prj-a-${stamp}`;
const TENANT_B = `itest-prj-b-${stamp}`;
const EMP = '00000000-0000-4000-8000-000000000003';

async function createProject(tenantId: string, code: string): Promise<string> {
  return withTenant(pool, tenantId, async (c) => {
    const res = await c.query<{ id: string }>(
      'insert into projects (tenant_id, code, name) values ($1, $2, $3) returning id',
      [tenantId, code, 'Projekt'],
    );
    return res.rows[0]!.id;
  });
}

async function book(tenantId: string, projectId: string, minutes: number): Promise<string> {
  return withTenant(pool, tenantId, async (c) => {
    const res = await c.query<{ id: string }>(
      `insert into project_time_entries (tenant_id, employee_id, project_id, work_date, minutes)
       values ($1, $2, $3, '2026-06-22', $4) returning id`,
      [tenantId, EMP, projectId, minutes],
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

describe('Projektzeit – RLS & Append-only (Integration, echtes Postgres)', () => {
  it('jeder Mandant sieht nur eigene Projekte', async () => {
    await createProject(TENANT_A, 'P-A');
    await createProject(TENANT_B, 'P-B');
    const aSeesB = await withTenant(pool, TENANT_A, async (c) =>
      (
        await c.query<{ n: number }>('select count(*)::int as n from projects where tenant_id = $1', [
          TENANT_B,
        ])
      ).rows[0]?.n,
    );
    expect(aSeesB).toBe(0);
  });

  it('Korrektur erfolgt über Gegenbuchung; Summe inkl. Korrektur', async () => {
    const id = await createProject(TENANT_A, `P-SUM-${stamp}`);
    await book(TENANT_A, id, 120);
    await book(TENANT_A, id, -30);
    const total = await withTenant(pool, TENANT_A, async (c) =>
      (
        await c.query<{ s: number }>(
          'select coalesce(sum(minutes),0)::int as s from project_time_entries where project_id = $1',
          [id],
        )
      ).rows[0]?.s,
    );
    expect(total).toBe(90);
  });

  it('UPDATE/DELETE einer Buchung werden per Trigger verhindert (append-only)', async () => {
    const id = await createProject(TENANT_A, `P-AO-${stamp}`);
    const entryId = await book(TENANT_A, id, 60);
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query('update project_time_entries set minutes = 999 where id = $1', [entryId]),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query('delete from project_time_entries where id = $1', [entryId]),
      ),
    ).rejects.toThrow();
  });
});
