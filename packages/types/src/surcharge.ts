import { z } from 'zod';
import { bundeslandSchema } from './common';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');

/** Eine gearbeitete Spanne in lokaler Zeit (zeitzonenunabhängig). */
export const workSpanSchema = z.object({
  date: isoDateSchema,
  startMinute: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(1).max(1440),
});
export type WorkSpanInput = z.infer<typeof workSpanSchema>;

/** Eingabe für die Zuschlagsvorschau: Spannen + Bundesland (für Feiertage). */
export const surchargePreviewSchema = z.object({
  land: bundeslandSchema,
  spans: z.array(workSpanSchema).min(1).max(366),
});
export type SurchargePreview = z.infer<typeof surchargePreviewSchema>;
