import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './common';
import { stampLocationSchema } from './geofence';

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
  // Nacherfassung (A-03): liegt occurredAt mehr als 24 h zurueck, ist eine
  // Begruendung PFLICHT; der Eintrag wird dauerhaft als late_entry markiert.
  reason: z.string().min(3).max(500).optional(),
  // Einsatzort-Uebersteuerung fuer diesen Stempel (ADR-0016); ohne Angabe gilt
  // der zum Zeitpunkt gueltige Standard-Einsatzort des Mitarbeitenden.
  workLocationId: uuidSchema.optional(),
  // Optionale Position (nur wenn Geofencing aktiviert ist, ADR-0014). GPS ist
  // standardmaessig aus (Kern-Invariante 5); die App sendet nichts ungefragt.
  location: stampLocationSchema.optional(),
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
