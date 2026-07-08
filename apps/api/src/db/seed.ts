import { Pool } from 'pg';
import { loadEnv } from '../config/env';

/**
 * Idempotenter Stammdaten-Seed fuer das lokale Demo: Mandant 'default' und
 * einige Mitarbeitende. Ausfuehren via `pnpm --filter @zeitvault/api seed`.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  // external_id verknüpft den Mitarbeiter mit dem OIDC-Subject (sub). Die festen
  // subs entsprechen den Demo-Nutzern im Keycloak-Realm (demo/admin-demo); damit
  // löst /me nach dem Login den richtigen Datensatz auf.
  const employees: ReadonlyArray<[string, string, string | null]> = [
    ['1001', 'Anna Beispiel', '11111111-1111-1111-1111-111111111111'],
    ['1002', 'Bernd Muster', '22222222-2222-2222-2222-222222222222'],
    ['1003', 'Clara Probe', null],
  ];

  try {
    await pool.query(
      "insert into tenants (id, name) values ('default', 'ZeitVault Demo') on conflict (id) do nothing",
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("select set_config('app.tenant_id', 'default', true)");
      // Standard-Einsatzort ist Pflicht-Stammdatum (ADR-0016): ohne ihn ist
      // keine Bewertung aufloesbar (es gibt bewusst keinen Zeitzonen-Fallback).
      await client.query(
        `insert into work_locations (tenant_id, name, country_code, state_code, time_zone, is_default)
         select 'default', 'Hauptstandort', 'DE', 'BE', 'Europe/Berlin', true
         where not exists (
           select 1 from work_locations
           where tenant_id = 'default' and is_default = true and active = true
         )`,
      );
      for (const [personnelNumber, displayName, externalId] of employees) {
        await client.query(
          `insert into employees (tenant_id, personnel_number, display_name, external_id)
           values ('default', $1, $2, $3)
           on conflict (tenant_id, personnel_number)
           do update set external_id = excluded.external_id`,
          [personnelNumber, displayName, externalId],
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
