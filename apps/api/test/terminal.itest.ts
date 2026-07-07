import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePool, runMigrations, withTenant } from './db';

let pool: Pool;
const stamp = Date.now();
const TENANT_A = `itest-term-a-${stamp}`;
const TENANT_B = `itest-term-b-${stamp}`;
const EMP = '00000000-0000-4000-8000-00000000000e';

beforeAll(async () => {
  pool = makePool();
  await runMigrations(pool);
});
afterAll(async () => {
  await pool.end();
});

describe('Terminals & NFC – RLS und Eindeutigkeit (Integration)', () => {
  it('Terminals sind mandantengetrennt (RLS)', async () => {
    await withTenant(pool, TENANT_A, (c) =>
      c.query("insert into terminals (tenant_id, name, token_hash) values ($1, 'Eingang', 'hashA')", [TENANT_A]),
    );
    await withTenant(pool, TENANT_B, (c) =>
      c.query("insert into terminals (tenant_id, name, token_hash) values ($1, 'Tor', 'hashB')", [TENANT_B]),
    );
    const aSeesB = await withTenant(pool, TENANT_A, async (c) =>
      (await c.query<{ n: number }>('select count(*)::int as n from terminals where tenant_id = $1', [TENANT_B]))
        .rows[0]?.n,
    );
    expect(aSeesB).toBe(0);
  });

  it('Terminal-Insert mit fremdem tenant_id wird durch WITH CHECK abgelehnt', async () => {
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query("insert into terminals (tenant_id, name, token_hash) values ($1, 'X', 'h')", [TENANT_B]),
      ),
    ).rejects.toThrow();
  });

  it('NFC-UID ist je Mandant eindeutig', async () => {
    await withTenant(pool, TENANT_A, (c) =>
      c.query("insert into nfc_credentials (tenant_id, uid, employee_id) values ($1, 'NFC-1', $2)", [TENANT_A, EMP]),
    );
    await expect(
      withTenant(pool, TENANT_A, (c) =>
        c.query("insert into nfc_credentials (tenant_id, uid, employee_id) values ($1, 'NFC-1', $2)", [TENANT_A, EMP]),
      ),
    ).rejects.toThrow();
  });

  it('dieselbe NFC-UID darf in verschiedenen Mandanten existieren', async () => {
    await withTenant(pool, TENANT_B, (c) =>
      c.query("insert into nfc_credentials (tenant_id, uid, employee_id) values ($1, 'NFC-1', $2)", [TENANT_B, EMP]),
    );
    const n = await withTenant(pool, TENANT_B, async (c) =>
      (await c.query<{ n: number }>("select count(*)::int as n from nfc_credentials where uid = 'NFC-1'"))
        .rows[0]?.n,
    );
    // Mandant B sieht nur die eigene UID-Zeile (RLS), nicht die von A.
    expect(n).toBe(1);
  });
});
