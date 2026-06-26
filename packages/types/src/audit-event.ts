import { z } from 'zod';

/**
 * Lohn-/sicherheitsrelevante Aktionen, die ein unveraenderliches AuditEvent
 * erzeugen (Kern-Invariante 2; ARCHITEKTUR.md Paragraf 9, ADR-0006).
 */
export const auditActionSchema = z.enum([
  'time_entry.create',
  'time_entry.correct',
  'time.clock_in',
  'time.break_start',
  'time.break_end',
  'time.clock_out',
  'time.correct',
  'absence.request',
  'absence.approve',
  'absence.reject',
  'absence.cancel',
  'account.post',
  'project_time.book',
  'eau.request',
  'export.run',
  'retention.block',
  'retention.anonymize',
  'retention.purge',
  'permission.change',
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

/** Eingabe zum Anhaengen eines Audit-Ereignisses (append-only). */
export const appendAuditEventSchema = z.object({
  tenantId: z.string().min(1),
  action: auditActionSchema,
  actorId: z.string().min(1),
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});
export type AppendAuditEvent = z.infer<typeof appendAuditEventSchema>;

/**
 * Persistiertes Audit-Ereignis in der hash-verketteten Kette. `hash` deckt den
 * Inhalt inklusive `prevHash` ab; `sequence` ist je Mandant fortlaufend.
 */
export interface AuditEvent extends AppendAuditEvent {
  id: string;
  sequence: number;
  prevHash: string | null;
  hash: string;
  recordedAt: string;
}
