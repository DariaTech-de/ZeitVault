import { z } from 'zod';

/** Ein Mapping-Eintrag: mandantenseitig gepflegte Abrechnungsschlüssel. */
export const datevMappingEntrySchema = z.object({
  lohnart: z.string().min(1).max(32),
  kostenstelle: z.string().max(32).optional(),
  ausfallschluessel: z.string().max(32).optional(),
  /** Verguetungsfaktor in Prozent je Bewertungsart (C-09); weggelassen = 100. */
  factorPercent: z.number().int().min(0).optional(),
});
export type DatevMappingEntry = z.infer<typeof datevMappingEntrySchema>;

/** Interne Abrechnungskategorien (C-09: eine je Bewertungsart). */
export const payrollCategorySchema = z.enum([
  'work_time',
  'on_call_duty',
  'standby',
  'travel',
  'vacation',
  'sick',
  'special',
]);
export type PayrollCategoryDto = z.infer<typeof payrollCategorySchema>;

/**
 * C-11: Pflege eines persistierten Mapping-Eintrags (Admin-UI). Aenderungen
 * sind ohne Deployment wirksam - der naechste Export nutzt den neuen Stand.
 */
export const setPayrollMappingSchema = datevMappingEntrySchema.extend({
  category: payrollCategorySchema,
});
export type SetPayrollMappingInput = z.infer<typeof setPayrollMappingSchema>;

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
