import { z } from 'zod';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');

/**
 * Anstoßen eines eAU-Abrufs für einen Krankheitszeitraum. Bewusst OHNE
 * Diagnose-/Gesundheitsinhalt (Datensparsamkeit, Art. 9 DSGVO).
 */
export const createEauRequestSchema = z
  .object({
    employeeId: z.string().uuid(),
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .refine((v) => v.from <= v.to, { message: 'from muss <= to sein', path: ['to'] });
export type CreateEauRequest = z.infer<typeof createEauRequestSchema>;
