import { z } from 'zod';
import { uuidSchema } from './common';

export const accountKindSchema = z.enum(['overtime', 'flextime', 'vacation']);
export type AccountKind = z.infer<typeof accountKindSchema>;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');

/**
 * Eingabe fuer eine Kontobuchung (C2). `amount` ist vorzeichenbehaftet
 * (Gutschrift positiv, Belastung negativ); Einheit je Kontoart: Minuten fuer
 * overtime/flextime, Tage fuer vacation. Buchungen sind append-only.
 */
export const postAccountTransactionSchema = z.object({
  employeeId: uuidSchema,
  account: accountKindSchema,
  amount: z.number().int(),
  effectiveDate: isoDateSchema,
  reason: z.string().max(500).optional(),
});
export type PostAccountTransaction = z.infer<typeof postAccountTransactionSchema>;
