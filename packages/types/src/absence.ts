import { z } from 'zod';
import { uuidSchema } from './common';

export const absenceTypeSchema = z.enum(['vacation', 'sick', 'special']);
export type AbsenceType = z.infer<typeof absenceTypeSchema>;

export const absenceStatusSchema = z.enum(['requested', 'approved', 'rejected', 'cancelled']);
export type AbsenceStatus = z.infer<typeof absenceStatusSchema>;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');

/** Eingabe fuer einen Abwesenheitsantrag (Zeitraum inklusiv). */
export const createAbsenceRequestSchema = z
  .object({
    employeeId: uuidSchema,
    type: absenceTypeSchema,
    from: isoDateSchema,
    to: isoDateSchema,
    reason: z.string().max(500).optional(),
  })
  .refine((value) => value.from <= value.to, {
    message: 'from muss <= to sein',
    path: ['to'],
  });
export type CreateAbsenceRequest = z.infer<typeof createAbsenceRequestSchema>;

/** Optionale Notiz bei Genehmigung/Ablehnung/Stornierung. */
export const absenceDecisionSchema = z.object({
  note: z.string().max(500).optional(),
});
export type AbsenceDecision = z.infer<typeof absenceDecisionSchema>;
