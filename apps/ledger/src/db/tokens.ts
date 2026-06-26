import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';

export const DB = Symbol('ZEITVAULT_LEDGER_DB');
export type Database = NodePgDatabase<typeof schema>;
