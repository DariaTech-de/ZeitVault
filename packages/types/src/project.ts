import { z } from 'zod';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');

/** Anlegen eines Projekts (Stammdaten). */
export const createProjectSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
});
export type CreateProject = z.infer<typeof createProjectSchema>;

/**
 * Buchung von Projektzeit. `minutes` ist vorzeichenbehaftet; eine Korrektur
 * erfolgt über eine negative Gegenbuchung (append-only, Kern-Invariante 1).
 */
export const bookProjectTimeSchema = z.object({
  employeeId: z.string().uuid(),
  workDate: isoDateSchema,
  minutes: z.number().int(),
  note: z.string().max(500).optional(),
});
export type BookProjectTime = z.infer<typeof bookProjectTimeSchema>;
