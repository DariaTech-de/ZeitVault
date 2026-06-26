import { integer, jsonb, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Append-only Audit-Ereignisse mit Hash-Verkettung (ADR-0006). `sequence` ist je
 * Mandant fortlaufend; (tenant_id, sequence) ist eindeutig. UPDATE/DELETE werden
 * auf DB-Ebene per Trigger verhindert (siehe migrations/0000_init.sql).
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    sequence: integer('sequence').notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    actorId: varchar('actor_id', { length: 128 }).notNull(),
    subjectType: varchar('subject_type', { length: 64 }).notNull(),
    subjectId: varchar('subject_id', { length: 128 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    // Exakt gehashter ISO-Zeitstempel als Text (deterministische Verifikation).
    recordedAt: text('recorded_at').notNull(),
    prevHash: varchar('prev_hash', { length: 64 }),
    hash: varchar('hash', { length: 64 }).notNull(),
  },
  (t) => [uniqueIndex('audit_events_tenant_seq_uq').on(t.tenantId, t.sequence)],
);

export type AuditEventRow = typeof auditEvents.$inferSelect;
export type NewAuditEventRow = typeof auditEvents.$inferInsert;
