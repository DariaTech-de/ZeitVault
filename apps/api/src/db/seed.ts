import { Pool } from 'pg';
import { loadEnv } from '../config/env';

/**
 * Idempotenter Stammdaten-Seed fuer das lokale Demo: Mandant 'default' und
 * einige Mitarbeitende. Ausfuehren via `pnpm --filter @zeitvault/api seed`.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const employees: ReadonlyArray<[string, string]> = [
    ['1001', 'Anna Beispiel'],
    ['1002', 'Bernd Muster'],
    ['1003', 'Clara Probe'],
  ];

  try {
    await pool.query(
      "insert into tenants (id, name) values ('default', 'ZeitVault Demo') on conflict (id) do nothing",
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("select set_config('app.tenant_id', 'default', true)");
      for (const [personnelNumber, displayName] of employees) {
        await client.query(
          "insert into employees (tenant_id, personnel_number, display_name) values ('default', $1, $2) on conflict (tenant_id, personnel_number) do nothing",
          [personnelNumber, displayName],
        );
      }
      const { rows } = await client.query<{ id: string; personnel_number: string }>(
        'select id, personnel_number from employees order by personnel_number',
      );
      await client.query('COMMIT');
      console.log(`[seed] Mandant 'default' + ${rows.length} Mitarbeitende vorhanden:`);
      for (const row of rows) {
        console.log(`  ${row.personnel_number} -> ${row.id}`);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('[seed] fehlgeschlagen:', err);
  process.exit(1);
});
