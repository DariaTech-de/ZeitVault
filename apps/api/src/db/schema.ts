import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
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

export const employeeStatus = pgEnum('employee_status', ['active', 'blocked', 'anonymized']);

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    personnelNumber: varchar('personnel_number', { length: 64 }).notNull(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    // OIDC-Subject (sub) des verknüpften Nutzers; /me löst darüber den
    // Mitarbeiter des angemeldeten Tokens auf.
    externalId: varchar('external_id', { length: 128 }),
    // Lebenszyklus für die Retention-/Lösch-Engine (E3, Kern-Invariante 4).
    status: employeeStatus('status').notNull().default('active'),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    deletionDueDate: date('deletion_due_date'),
    retentionClass: varchar('retention_class', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('employees_tenant_idx').on(t.tenantId),
    uniqueIndex('employees_tenant_personnel_uq').on(t.tenantId, t.personnelNumber),
  ],
);

export type EmployeeRow = typeof employees.$inferSelect;

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

/** Ergebnis der Standort-Prüfung (Geofencing); Default 'not_required'. */
export const locationCheck = pgEnum('location_check', ['not_required', 'inside', 'outside', 'no_signal']);

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
    // Standort-Pruefung (Geofencing, ADR-0014). Beim Insert einmalig gesetzt;
    // Datensparsamkeit: nur Ergebnis/Standort/Distanz, keine rohen Koordinaten.
    locationCheck: locationCheck('location_check').notNull().default('not_required'),
    locationSiteId: uuid('location_site_id'),
    locationDistanceM: integer('location_distance_m'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stamp_events_tenant_idx').on(t.tenantId),
    index('stamp_events_employee_idx').on(t.employeeId, t.occurredAt),
  ],
);

export type StampEventRow = typeof stampEvents.$inferSelect;
export type NewStampEventRow = typeof stampEvents.$inferInsert;

/** Mandanteneinstellung Geofencing (Default AUS, Kern-Invariante 5). */
export const geofenceSettings = pgTable('geofence_settings', {
  tenantId: varchar('tenant_id', { length: 64 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  updatedBy: varchar('updated_by', { length: 128 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export type GeofenceSettingsRow = typeof geofenceSettings.$inferSelect;

/** Standorte/Geofences eines Mandanten (Mittelpunkt + Radius in Metern). */
export const geofenceSites = pgTable(
  'geofence_sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    radiusM: integer('radius_m').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('geofence_sites_tenant_idx').on(t.tenantId)],
);
export type GeofenceSiteRow = typeof geofenceSites.$inferSelect;

/** Admin-Kennzeichnung eines Stempels („blinken"); getrennte Workflow-Entität. */
export const stampFlags = pgTable(
  'stamp_flags',
  {
    eventId: uuid('event_id').primaryKey(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    flagged: boolean('flagged').notNull().default(true),
    reason: text('reason'),
    flaggedBy: varchar('flagged_by', { length: 128 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stamp_flags_tenant_idx').on(t.tenantId)],
);
export type StampFlagRow = typeof stampFlags.$inferSelect;

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

/** Projekte (Stammdaten, veränderbar) für die Projektzeiterfassung (F2). */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('projects_tenant_idx').on(t.tenantId),
    uniqueIndex('projects_tenant_code_uq').on(t.tenantId, t.code),
  ],
);
export type ProjectRow = typeof projects.$inferSelect;

/**
 * Projektzeit-Buchungen (lohn-/abrechnungsrelevant, append-only). Korrektur über
 * vorzeichenbehaftete Gegenbuchung; UPDATE/DELETE per Trigger verhindert
 * (Kern-Invariante 1; siehe migrations/0011_projects.sql).
 */
export const projectTimeEntries = pgTable(
  'project_time_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    employeeId: uuid('employee_id').notNull(),
    projectId: uuid('project_id').notNull(),
    workDate: date('work_date').notNull(),
    minutes: integer('minutes').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('project_time_tenant_idx').on(t.tenantId),
    index('project_time_project_idx').on(t.projectId, t.workDate),
    index('project_time_employee_idx').on(t.employeeId, t.workDate),
  ],
);
export type ProjectTimeEntryRow = typeof projectTimeEntries.$inferSelect;

export const eauStatus = pgEnum('eau_status', ['requested', 'submitted', 'confirmed', 'failed']);

/**
 * eAU-Abrufe (F1, Gerüst). Workflow-Entität mit Statuswechseln (veränderbar).
 * Datensparsam: KEIN Diagnoseinhalt, nur Status/Referenz (Art. 9 DSGVO). Die
 * Übertragung erfolgt über ein zertifiziertes externes Gateway (blockiert).
 */
export const eauRequests = pgTable(
  'eau_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    employeeId: uuid('employee_id').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    status: eauStatus('status').notNull().default('requested'),
    externalRef: varchar('external_ref', { length: 128 }),
    lastError: text('last_error'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('eau_requests_tenant_idx').on(t.tenantId),
    index('eau_requests_employee_idx').on(t.employeeId),
  ],
);
export type EauRequestRow = typeof eauRequests.$inferSelect;

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

export const correctionKind = pgEnum('correction_kind', ['add', 'correct']);
export const correctionStatus = pgEnum('correction_status', ['requested', 'approved', 'rejected']);

/**
 * Anpassungsanträge ("Stempel vergessen"): Mitarbeitende beantragen das
 * Nachtragen/Korrigieren einer Stempelung. Workflow-Entität (Statuswechsel).
 * Erst die Freigabe erzeugt den append-only Stempel (siehe migrations/0014).
 */
export const stampCorrectionRequests = pgTable(
  'stamp_correction_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    employeeId: uuid('employee_id').notNull(),
    kind: correctionKind('kind').notNull(),
    targetEventId: uuid('target_event_id'),
    proposedKind: stampKind('proposed_kind').notNull(),
    proposedOccurredAt: timestamp('proposed_occurred_at', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    status: correctionStatus('status').notNull().default('requested'),
    approverId: varchar('approver_id', { length: 128 }),
    appliedEventId: uuid('applied_event_id'),
    note: text('note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('correction_requests_tenant_idx').on(t.tenantId),
    index('correction_requests_employee_idx').on(t.employeeId),
  ],
);
export type StampCorrectionRequestRow = typeof stampCorrectionRequests.$inferSelect;

/**
 * Lizenz je Mandant (Sitzplatz-Modell). Speichert das signierte Token und die
 * daraus verifizierten Felder; genau eine aktive Lizenz je Mandant (siehe
 * migrations/0015). Der oeffentliche Schluessel zur Pruefung ist konfiguriert.
 */
export const licenses = pgTable('licenses', {
  tenantId: varchar('tenant_id', { length: 64 }).primaryKey(),
  licenseId: uuid('license_id').notNull(),
  customer: varchar('customer', { length: 200 }).notNull(),
  tier: varchar('tier', { length: 64 }).notNull(),
  seats: integer('seats').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
  validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  features: jsonb('features').notNull().default([]),
  token: text('token').notNull(),
  activatedBy: varchar('activated_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export type LicenseRow = typeof licenses.$inferSelect;

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
