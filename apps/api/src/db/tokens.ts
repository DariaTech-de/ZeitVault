import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';

/** DI-Token fuer die Drizzle-Datenbankinstanz. */
export const DB = Symbol('ZEITVAULT_DB');

/** Typ der injizierten Datenbankinstanz inkl. Schema. */
export type Database = NodePgDatabase<typeof schema>;
