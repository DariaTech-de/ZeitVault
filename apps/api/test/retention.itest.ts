import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const stamp = Date.now();
const TENANT = `itest-ret-${stamp}`;
let seq = 0;

async function insertEmployee(): Promise<string> {
  const personnel = `R-${(seq += 1)}`;
  return withTenant(pool, TENANT, async (c) => {
    const res = await c.query<{ id: string }>(
      'insert into employees (tenant_id, personnel_number, display_name) values ($1, $2, $3) returning id',
      [TENANT, personnel, 'Max Muster'],
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

describe('Retention – Mitarbeiter-Lebenszyklus (Integration, echtes Postgres)', () => {
  it('Sperren setzt Status und Löschdatum (employees ist veränderlich)', async () => {
    const id = await insertEmployee();
    const row = await withTenant(pool, TENANT, async (c) => {
      await c.query(
        "update employees set status = 'blocked', blocked_at = now(), deletion_due_date = '2036-12-31', retention_class = 'gobd_10y' where id = $1",
        [id],
      );
      return (
        await c.query<{ status: string; deletion_due_date: string }>(
          'select status, deletion_due_date from employees where id = $1',
          [id],
        )
      ).rows[0];
    });
    expect(row?.status).toBe('blocked');
  });

  it('Pseudonymisierung ersetzt personenbezogene Stammdaten', async () => {
    const id = await insertEmployee();
    const row = await withTenant(pool, TENANT, async (c) => {
      await c.query(
        "update employees set status = 'anonymized', anonymized_at = now(), display_name = 'Gesperrt (X)', personnel_number = $2 where id = $1",
        [id, `ANON-${stamp}`],
      );
      return (
        await c.query<{ status: string; display_name: string }>(
          'select status, display_name from employees where id = $1',
          [id],
        )
      ).rows[0];
    });
    expect(row?.status).toBe('anonymized');
    expect(row?.display_name).toBe('Gesperrt (X)');
  });

  it('löschfähige Datensätze werden über deletion_due_date gefunden', async () => {
    const id = await insertEmployee();
    await withTenant(pool, TENANT, (c) =>
      c.query("update employees set deletion_due_date = '2000-01-01' where id = $1", [id]),
    );
    const due = await withTenant(pool, TENANT, async (c) =>
      (
        await c.query<{ n: number }>(
          "select count(*)::int as n from employees where tenant_id = $1 and deletion_due_date <= '2026-06-26'",
          [TENANT],
        )
      ).rows[0]?.n,
    );
    expect(due).toBeGreaterThanOrEqual(1);
  });
});
