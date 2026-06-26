import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadEnv } from '../config/env';
import * as schema from './schema';
import { DB } from './tokens';

/**
 * Stellt die Drizzle-Datenbankinstanz global bereit. Der Tenant-Kontext wird
 * NICHT hier, sondern je Transaktion via set_config gesetzt (ADR-0004).
 */
@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: () => {
        const env = loadEnv();
        const pool = new Pool({ connectionString: env.DATABASE_URL });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
