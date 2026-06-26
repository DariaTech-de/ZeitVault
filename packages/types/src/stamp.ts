import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './common';

/** Art einer Stempelung. */
export const stampKindSchema = z.enum(['clock_in', 'break_start', 'break_end', 'clock_out']);
export type StampKind = z.infer<typeof stampKindSchema>;

export const stampSourceSchema = z.enum(['web', 'mobile', 'terminal']);
export type StampSource = z.infer<typeof stampSourceSchema>;

/**
 * Eingabe einer Stempelung. `occurredAt` ist optional (Default: Serverzeit);
 * fuer Offline-Sync (Mobile) wird der tatsaechliche Zeitpunkt mitgesendet.
 */
export const stampSchema = z.object({
  employeeId: uuidSchema,
  source: stampSourceSchema.default('web'),
  occurredAt: isoTimestampSchema.optional(),
});
export type StampInput = z.infer<typeof stampSchema>;

/**
 * Korrektur einer Stempelung: erzeugt ein NEUES, ueberschreibendes Ereignis mit
 * korrigiertem Zeitpunkt und Pflicht-Begruendung (Kern-Invariante 1; das
 * Original bleibt erhalten).
 */
export const stampCorrectionSchema = z.object({
  eventId: uuidSchema,
  occurredAt: isoTimestampSchema,
  correctionReason: z.string().min(3),
});
export type StampCorrectionInput = z.infer<typeof stampCorrectionSchema>;
