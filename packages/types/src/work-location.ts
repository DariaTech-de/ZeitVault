import { z } from 'zod';
import { bundeslandSchema, uuidSchema } from './common';

/**
 * Einsatzorte (ADR-0016): Ort der Arbeitsstaette. Bestimmt Zeitzone
 * (Tagesgrenzen, K-01/K-06) und Feiertagsrecht (Bundesland/Gemeinde, C-08).
 * Die IANA-Zeitzone wird serverseitig gegen ICU validiert.
 */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');

export const createWorkLocationSchema = z.object({
  name: z.string().min(1).max(200),
  countryCode: z.string().length(2).default('DE'),
  stateCode: bundeslandSchema.optional(),
  /** Amtlicher Gemeindeschluessel (AGS) fuer gemeindescharfe Feiertage (optional). */
  municipalityCode: z.string().min(1).max(16).optional(),
  timeZone: z.string().min(1).max(64),
  /** Fallback-Einsatzort des Mandanten, wenn ein Mitarbeitender keine Zuordnung hat. */
  isDefault: z.boolean().default(false),
});
export type CreateWorkLocation = z.infer<typeof createWorkLocationSchema>;

/** Zuordnung Standard-Einsatzort -> Mitarbeitende, mit Gueltigkeit (Historie). */
export const assignWorkLocationSchema = z
  .object({
    employeeId: uuidSchema,
    workLocationId: uuidSchema,
    validFrom: isoDateSchema,
    validTo: isoDateSchema.optional(),
  })
  .refine((v) => v.validTo === undefined || v.validFrom <= v.validTo, {
    message: 'validFrom muss <= validTo sein',
    path: ['validTo'],
  });
export type AssignWorkLocation = z.infer<typeof assignWorkLocationSchema>;

export interface WorkLocationSummary {
  id: string;
  name: string;
  countryCode: string;
  stateCode: string | null;
  municipalityCode: string | null;
  timeZone: string;
  isDefault: boolean;
  active: boolean;
}

/**
 * Bei der Bewertung aufgeloester Einsatzort (Snapshot-Form, ADR-0016): wird an
 * Bewertungen gespeichert, damit Stammdatenkorrekturen abgeschlossene
 * Abrechnungen nicht still umschreiben (F-05).
 */
export interface ResolvedWorkLocation {
  workLocationId: string | null;
  timeZone: string;
  countryCode: string;
  stateCode: string | null;
  municipalityCode: string | null;
  /** Herkunft der Aufloesung (Uebersteuerung > Zuordnung > Mandanten-Default > Fallback). */
  resolvedFrom: 'entry_override' | 'employee_assignment' | 'tenant_default' | 'fallback';
}
