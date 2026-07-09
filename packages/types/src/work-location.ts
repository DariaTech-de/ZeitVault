import { z } from 'zod';
import { bundeslandSchema, uuidSchema } from './common';

/**
 * Einsatzorte (ADR-0016): Ort der Arbeitsstaette. Bestimmt Zeitzone
 * (Tagesgrenzen, K-01/K-06) und Feiertagsrecht (Bundesland/Gemeinde, C-08).
 * Die IANA-Zeitzone wird serverseitig gegen ICU validiert.
 */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');

/**
 * Gemeinde-Feiertage (C-08) als explizite Schluessel am Einsatzort; ZeitVault
 * fuehrt bewusst keine amtliche Gemeindeliste (Pflege durch Administration).
 */
export const municipalHolidayKeySchema = z.enum([
  'fronleichnam',
  'mariae_himmelfahrt',
  'friedensfest',
]);
export type MunicipalHolidayKeyDto = z.infer<typeof municipalHolidayKeySchema>;

export const createWorkLocationSchema = z.object({
  name: z.string().min(1).max(200),
  countryCode: z.string().length(2).default('DE'),
  stateCode: bundeslandSchema.optional(),
  /** Amtlicher Gemeindeschluessel (AGS) fuer gemeindescharfe Feiertage (optional). */
  municipalityCode: z.string().min(1).max(16).optional(),
  /** Gemeinde-Feiertagsausnahmen dieses Einsatzortes (C-08). */
  municipalHolidayKeys: z.array(municipalHolidayKeySchema).max(3).optional(),
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
  municipalHolidayKeys: MunicipalHolidayKeyDto[];
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
  workLocationId: string;
  timeZone: string;
  countryCode: string;
  stateCode: string | null;
  municipalityCode: string | null;
  /** Gemeinde-Feiertagsausnahmen des aufgeloesten Einsatzortes (C-08). */
  municipalHolidayKeys: MunicipalHolidayKeyDto[];
  /**
   * Herkunft der Aufloesung (Uebersteuerung > Zuordnung > Mandanten-Default).
   * Es gibt bewusst KEINEN stillen Fallback: fehlt der Mandanten-Default,
   * scheitert die Aufloesung laut (Pflicht-Stammdatum).
   */
  resolvedFrom: 'entry_override' | 'employee_assignment' | 'tenant_default';
}
