import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const TENANT = `itest-ao-${Date.now()}`;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
  await withTenant(pool, TENANT, (c) =>
    c.query(
      "insert into stamp_events (tenant_id, employee_id, kind, occurred_at, source) values ($1, gen_random_uuid(), 'clock_in', now(), 'web')",
      [TENANT],
    ),
  );
});
afterAll(async () => {
  await pool.end();
});

describe('Append-only / GoBD-Unveraenderbarkeit (Integration)', () => {
  it('UPDATE auf stamp_events ist verboten', async () => {
    await expect(
      withTenant(pool, TENANT, (c) =>
        c.query("update stamp_events set source = 'mobile' where tenant_id = $1", [TENANT]),
      ),
    ).rejects.toThrow(/append-only/i);
  });

  it('DELETE auf stamp_events ist verboten', async () => {
    await expect(
      withTenant(pool, TENANT, (c) =>
        c.query('delete from stamp_events where tenant_id = $1', [TENANT]),
      ),
    ).rejects.toThrow(/append-only/i);
  });
});
