import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { loadEnv } from '../config/env';

async function main(): Promise<void> {
  const env = loadEnv();
  const dir = join(__dirname, 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    for (const file of files) {
      const sql = await readFile(join(dir, file), 'utf8');
      console.log(`[ledger migrate] applying ${file}`);
      await pool.query(sql);
    }
    console.log(`[ledger migrate] done (${files.length} Migration(en))`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('[ledger migrate] failed:', err);
  process.exit(1);
});
