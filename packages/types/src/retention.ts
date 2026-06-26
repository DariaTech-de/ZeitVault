import { z } from 'zod';

export const retentionClassSchema = z.enum(['gobd_10y', 'payroll_6y', 'dsgvo_general']);
export type RetentionClassInput = z.infer<typeof retentionClassSchema>;

/**
 * Sperrung eines Mitarbeitenden (Austritt/Löschanfrage). Setzt den
 * Aufbewahrungsrahmen; die harte Löschung erfolgt erst nach Fristablauf
 * (Kern-Invariante 4).
 */
export const blockEmployeeSchema = z.object({
  retentionClass: retentionClassSchema.default('gobd_10y'),
  reason: z.string().max(500).optional(),
});
export type BlockEmployeeInput = z.infer<typeof blockEmployeeSchema>;
