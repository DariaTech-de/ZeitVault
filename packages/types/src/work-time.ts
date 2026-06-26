import { z } from 'zod';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');

/** Eingabe zum Anlegen eines Arbeitszeitmodells (Sollzeit je Wochentag, Mo..So). */
export const createWorkTimeModelSchema = z.object({
  name: z.string().min(1),
  validFrom: isoDateSchema,
  validTo: isoDateSchema.nullable().default(null),
  targetMinutesByWeekday: z.array(z.number().int().min(0).max(1440)).length(7),
});
export type CreateWorkTimeModel = z.infer<typeof createWorkTimeModelSchema>;
