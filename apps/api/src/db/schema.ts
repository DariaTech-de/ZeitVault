import {
  date,
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
    // Korrektur: verweist auf das ueberschriebene Ereignis (append-only, B1).
    correctsEventId: uuid('corrects_event_id'),
    correctionReason: text('correction_reason'),
    // Idempotenzschluessel fuer Offline-Sync (B3); NULL bei Server-Erfassung.
    clientEventId: uuid('client_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stamp_events_tenant_idx').on(t.tenantId),
    index('stamp_events_employee_idx').on(t.employeeId, t.occurredAt),
  ],
);

export type StampEventRow = typeof stampEvents.$inferSelect;
export type NewStampEventRow = typeof stampEvents.$inferInsert;

export const absenceType = pgEnum('absence_type', ['vacation', 'sick', 'special']);
export const absenceStatus = pgEnum('absence_status', [
  'requested',
  'approved',
  'rejected',
  'cancelled',
]);

/**
 * Abwesenheitsantraege (Urlaub/Krankheit/Sonderurlaub) mit Genehmigungs-Workflow
 * (C1). Anders als TimeEntry/StampEvent ist dies eine Workflow-Entitaet mit
 * Statuswechseln (requested -> approved/rejected/cancelled); jeder Schritt erzeugt
 * ein AuditEvent (Kern-Invariante 2). Mandantentrennung via RLS (ADR-0004).
 */
export const absenceRequests = pgTable(
  'absence_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    employeeId: uuid('employee_id').notNull(),
    type: absenceType('type').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    status: absenceStatus('status').notNull().default('requested'),
    reason: text('reason'),
    approverId: varchar('approver_id', { length: 128 }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('absence_requests_tenant_idx').on(t.tenantId),
    index('absence_requests_employee_idx').on(t.employeeId),
  ],
);

export type AbsenceRequestRow = typeof absenceRequests.$inferSelect;
export type NewAbsenceRequestRow = typeof absenceRequests.$inferInsert;

export const exportKind = pgEnum('export_kind', ['gobd_time', 'payroll_generic']);

/**
 * Protokoll der GoBD-Prüfexporte (D2). Jeder Lauf ist ein unveränderlicher
 * Eintrag mit Prüfsumme (reproduzierbar); UPDATE/DELETE werden per Trigger
 * verhindert (Kern-Invariante 1; siehe migrations/0008_export_jobs.sql).
 */
export const exportJobs = pgTable(
  'export_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    kind: exportKind('kind').notNull(),
    periodFrom: date('period_from').notNull(),
    periodTo: date('period_to').notNull(),
    format: varchar('format', { length: 16 }).notNull(),
    rowCount: integer('row_count').notNull(),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    requestedBy: varchar('requested_by', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('export_jobs_tenant_idx').on(t.tenantId, t.createdAt)],
);

export type ExportJobRow = typeof exportJobs.$inferSelect;

export const accountKind = pgEnum('account_kind', ['overtime', 'flextime', 'vacation']);

/**
 * Buchungen der Arbeitszeitkonten (C2). Append-only/lohnrelevant: eine Korrektur
 * erfolgt ueber eine vorzeichenbehaftete Gegenbuchung, UPDATE/DELETE werden per
 * Trigger verhindert (Kern-Invariante 1; siehe migrations/0007_accounts.sql).
 * Einheit je Kontoart: Minuten (overtime/flextime), Tage (vacation).
 */
export const accountTransactions = pgTable(
  'account_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    employeeId: uuid('employee_id').notNull(),
    account: accountKind('account').notNull(),
    amount: integer('amount').notNull(),
    effectiveDate: date('effective_date').notNull(),
    reason: text('reason'),
    sourceType: varchar('source_type', { length: 64 }),
    sourceId: varchar('source_id', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('account_transactions_tenant_idx').on(t.tenantId),
    index('account_transactions_employee_idx').on(t.employeeId, t.account, t.effectiveDate),
  ],
);

export type AccountTransactionRow = typeof accountTransactions.$inferSelect;
export type NewAccountTransactionRow = typeof accountTransactions.$inferInsert;

/** Versionierte Arbeitszeitmodelle (Sollzeit je Wochentag in Minuten). */
export const workTimeModels = pgTable(
  'work_time_models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
    targetMinutes: integer('target_minutes').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('work_time_models_tenant_idx').on(t.tenantId)],
);

export type WorkTimeModelRow = typeof workTimeModels.$inferSelect;
