import { z } from 'zod';

export const absenceTypeSchema = z.enum(['vacation', 'sick', 'special']);
export type AbsenceType = z.infer<typeof absenceTypeSchema>;

export const absenceStatusSchema = z.enum([
  'requested',
  'approved',
  'rejected',
  'cancelled',
]);
export type AbsenceStatus = z.infer<typeof absenceStatusSchema>;
