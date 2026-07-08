import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { makePool, runMigrations, withTenant } from './db';

// RLS-Pflichttests fuer die neuen Tabellen (ADR-0016; CLAUDE.md Abschnitt 6):
// Cross-Tenant-Zugriff auf work_locations/employee_work_locations ist auf
// Query-Ebene unmoeglich (J-01, Kern-Invariante 3).
const stamp = Date.now();
const TENANT_A = `itest-wl-a-${stamp}`;
const TENANT_B = `itest-wl-b-${stamp}`;

let pool: Pool;

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('work_locations RLS', () => {
  it('Einsatzorte sind mandantengetrennt', async () => {
    await withTenant(pool, TENANT_A, (c) =>
      c.query(
        `insert into work_locations (tenant_id, name, state_code, time_zone)
         values ($1, 'Werk Muenchen', 'BY', 'Europe/Berlin')`,
        [TENANT_A],
      ),
    );
    const fromB = await withTenant(pool, TENANT_B, (c) =>
      c.query('select id from work_locations'),
    );
    expect(fromB.rowCount).toBe(0);
    const fromA = await withTenant(pool, TENANT_A, (c) =>
      c.query('select name from work_locations'),
    );
    expect(fromA.rows.map((r) => r.name)).toContain('Werk Muenchen');
  });

  it('Insert mit fremdem tenant_id wird durch WITH CHECK abgelehnt', async () => {
    await expect(
      withTenant(pool, TENANT_B, (c) =>
        c.query(
          `insert into work_locations (tenant_id, name, state_code, time_zone)
           values ($1, 'Einbruchsversuch', 'HE', 'Europe/Berlin')`,
          [TENANT_A],
        ),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });
});

describe('employee_work_locations RLS', () => {
  it('Zuordnungen sind mandantengetrennt', async () => {
    const emp = await withTenant(pool, TENANT_A, (c) =>
      c.query(
        `insert into employees (tenant_id, personnel_number, display_name)
         values ($1, 'WL-1001', 'RLS Probe') returning id`,
        [TENANT_A],
      ),
    );
    const loc = await withTenant(pool, TENANT_A, (c) =>
      c.query('select id from work_locations limit 1'),
    );
    await withTenant(pool, TENANT_A, (c) =>
      c.query(
        `insert into employee_work_locations (tenant_id, employee_id, work_location_id, valid_from)
         values ($1, $2, $3, '2026-01-01')`,
        [TENANT_A, emp.rows[0].id, loc.rows[0].id],
      ),
    );
    const fromB = await withTenant(pool, TENANT_B, (c) =>
      c.query('select id from employee_work_locations'),
    );
    expect(fromB.rowCount).toBe(0);
  });
});
