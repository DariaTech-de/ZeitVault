import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const timeEntrySource = pgEnum('time_entry_source', ['web', 'mobile', 'terminal']);
export const timeEntryStatus = pgEnum('time_entry_status', [
  'open',
  'submitted',
  'approved',
  'corrected',
]);

/** Mandanten. Self-Hosted nutzt genau einen Eintrag mit id = 'default' (ADR-0004). */
export const tenants = pgTable('tenants', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    personnelNumber: varchar('personnel_number', { length: 64 }).notNull(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('employees_tenant_idx').on(t.tenantId),
    uniqueIndex('employees_tenant_personnel_uq').on(t.tenantId, t.personnelNumber),
  ],
);

/**
 * Zeiteintraege. Append-only: eine Korrektur erzeugt eine NEUE Revision mit
 * Verweis auf den Vorgaenger (previousEntryId) und Pflicht-Begruendung
 * (correctionReason). UPDATE/DELETE werden auf DB-Ebene per Trigger verhindert
 * (Kern-Invariante 1, GoBD; siehe migrations/0000_init.sql).
 */
export const timeEntries = pgTable(
  'time_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    employeeId: uuid('employee_id').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }),
    source: timeEntrySource('source').notNull(),
    status: timeEntryStatus('status').notNull().default('open'),
    revision: integer('revision').notNull().default(1),
    previousEntryId: uuid('previous_entry_id'),
    correctionReason: text('correction_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('time_entries_tenant_idx').on(t.tenantId),
    index('time_entries_employee_idx').on(t.employeeId),
  ],
);

export type TimeEntryRow = typeof timeEntries.$inferSelect;
export type NewTimeEntryRow = typeof timeEntries.$inferInsert;

export const stampKind = pgEnum('stamp_kind', [
  'clock_in',
  'break_start',
  'break_end',
  'clock_out',
]);

/**
 * Rohe Stempelungen (Kommen/Gehen/Pausen) als append-only Ereignisse. Eine
 * Korrektur erzeugt ein NEUES Ereignis; UPDATE/DELETE werden per Trigger
 * verhindert (GoBD). Arbeits-/Pausenzeiten werden daraus berechnet
 * (packages/domain), nicht gespeichert.
 */
export const stampEvents = pgTable(
  'stamp_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    employeeId: uuid('employee_id').notNull(),
    kind: stampKind('kind').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    source: timeEntrySource('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stamp_events_tenant_idx').on(t.tenantId),
    index('stamp_events_employee_idx').on(t.employeeId, t.occurredAt),
  ],
);

export type StampEventRow = typeof stampEvents.$inferSelect;
export type NewStampEventRow = typeof stampEvents.$inferInsert;
