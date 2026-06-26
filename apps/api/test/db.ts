import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://zeitvault:zeitvault@localhost:5432/zeitvault';

export function makePool(): Pool {
  return new Pool({ connectionString: DATABASE_URL });
}

/** Wendet die hand-gepflegten SQL-Migrationen idempotent an (RLS/Trigger). */
export async function runMigrations(pool: Pool): Promise<void> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await pool.query(await readFile(join(dir, file), 'utf8'));
  }
}

/**
 * Fuehrt `fn` in einer Transaktion mit gesetztem Tenant-Kontext aus - exakt wie
 * die Anwendung (set_config('app.tenant_id', ..., is_local=true)).
 */
export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
