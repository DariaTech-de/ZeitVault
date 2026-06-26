import { z } from 'zod';

/** Ein Mapping-Eintrag: mandantenseitig gepflegte Abrechnungsschlüssel. */
export const datevMappingEntrySchema = z.object({
  lohnart: z.string().min(1).max(32),
  kostenstelle: z.string().max(32).optional(),
  ausfallschluessel: z.string().max(32).optional(),
});
export type DatevMappingEntry = z.infer<typeof datevMappingEntrySchema>;

/**
 * Mapping-Tabelle interne Kategorie -> Abrechnungsschlüssel. Bewusst KEINE
 * DATEV-Feldlayouts (CLAUDE.md §9) - nur die konfigurierbare Zuordnung.
 */
export const datevMappingSchema = z.object({
  work_time: datevMappingEntrySchema.optional(),
  vacation: datevMappingEntrySchema.optional(),
  sick: datevMappingEntrySchema.optional(),
  special: datevMappingEntrySchema.optional(),
});
export type DatevMappingInput = z.infer<typeof datevMappingSchema>;

/** Eingabe für den generischen Lohnexport. */
export const payrollExportSchema = z.object({
  mapping: datevMappingSchema,
});
export type PayrollExportInput = z.infer<typeof payrollExportSchema>;
