import { z } from 'zod';
import type { IsoTimestamp, Uuid } from './common';
import { isoTimestampSchema, uuidSchema } from './common';

export const timeEntrySourceSchema = z.enum(['web', 'mobile', 'terminal']);
export type TimeEntrySource = z.infer<typeof timeEntrySourceSchema>;

export const timeEntryStatusSchema = z.enum(['open', 'submitted', 'approved', 'corrected']);
export type TimeEntryStatus = z.infer<typeof timeEntryStatusSchema>;

/** Eingabe zum Erfassen eines Zeiteintrags (Kommen/Gehen). */
export const createTimeEntrySchema = z.object({
  employeeId: uuidSchema,
  start: isoTimestampSchema,
  end: isoTimestampSchema.nullable(),
  source: timeEntrySourceSchema,
});
export type CreateTimeEntry = z.infer<typeof createTimeEntrySchema>;

/**
 * Korrektur eines bestehenden Eintrags. Ein `TimeEntry` wird NIEMALS
 * ueberschrieben: eine Korrektur erzeugt eine neue Revision mit Verweis auf
 * den Vorgaenger und einer Pflicht-Begruendung (Kern-Invariante 1; GoBD,
 * ARCHITEKTUR.md Paragraf 8/9, ADR-0006).
 */
export const correctTimeEntrySchema = z.object({
  previousEntryId: uuidSchema,
  start: isoTimestampSchema,
  end: isoTimestampSchema.nullable(),
  correctionReason: z.string().min(3),
});
export type CorrectTimeEntry = z.infer<typeof correctTimeEntrySchema>;

/** Eine konkrete Revision eines Zeiteintrags. */
export interface TimeEntry {
  id: Uuid;
  tenantId: string;
  employeeId: Uuid;
  start: IsoTimestamp;
  end: IsoTimestamp | null;
  source: TimeEntrySource;
  status: TimeEntryStatus;
  revision: number;
  previousEntryId: Uuid | null;
  correctionReason: string | null;
  createdAt: IsoTimestamp;
}
