import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const stamp = Date.now();
const TENANT = `itest-me-${stamp}`;
const SUB = `oidc-sub-${stamp}`;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
});
afterAll(async () => {
  await pool.end();
});

describe('/me – Auflösung Mitarbeiter über external_id (Integration)', () => {
  it('löst den Mitarbeiter über tenant_id + external_id (== sub) auf', async () => {
    await withTenant(pool, TENANT, (c) =>
      c.query(
        "insert into employees (tenant_id, personnel_number, display_name, external_id) values ($1, 'ME-1', 'Profil Person', $2)",
        [TENANT, SUB],
      ),
    );
    const row = await withTenant(pool, TENANT, async (c) =>
      (
        await c.query<{ display_name: string }>(
          'select display_name from employees where tenant_id = $1 and external_id = $2',
          [TENANT, SUB],
        )
      ).rows[0],
    );
    expect(row?.display_name).toBe('Profil Person');
  });

  it('external_id ist je Mandant eindeutig (verhindert Doppelverknüpfung)', async () => {
    await expect(
      withTenant(pool, TENANT, (c) =>
        c.query(
          "insert into employees (tenant_id, personnel_number, display_name, external_id) values ($1, 'ME-2', 'Zweite Person', $2)",
          [TENANT, SUB],
        ),
      ),
    ).rejects.toThrow();
  });

  it('mehrere Mitarbeitende ohne Verknüpfung (NULL) sind erlaubt', async () => {
    await withTenant(pool, TENANT, (c) =>
      c.query(
        "insert into employees (tenant_id, personnel_number, display_name) values ($1, 'ME-3', 'Ohne Login A'), ($1, 'ME-4', 'Ohne Login B')",
        [TENANT],
      ),
    );
    const n = await withTenant(pool, TENANT, async (c) =>
      (
        await c.query<{ n: number }>(
          'select count(*)::int as n from employees where tenant_id = $1 and external_id is null',
          [TENANT],
        )
      ).rows[0]?.n,
    );
    expect(n).toBeGreaterThanOrEqual(2);
  });
});
