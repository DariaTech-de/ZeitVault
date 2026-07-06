import { z } from 'zod';
import { uuidSchema } from './common';
import { stampKindSchema } from './stamp';

export const correctionKindSchema = z.enum(['add', 'correct']);
export type CorrectionKind = z.infer<typeof correctionKindSchema>;

export const correctionStatusSchema = z.enum(['requested', 'approved', 'rejected']);
export type CorrectionStatus = z.infer<typeof correctionStatusSchema>;

/**
 * Anpassungsantrag eines Mitarbeitenden ("Stempel vergessen"): entweder eine
 * fehlende Stempelung NACHTRAGEN ('add') oder eine bestehende KORRIGIEREN
 * ('correct', mit targetEventId). Der Antrag ändert nichts direkt; erst die
 * Freigabe durch Vorgesetzte erzeugt den append-only Stempel (Kern-Invariante 1).
 */
export const createCorrectionRequestSchema = z
  .object({
    employeeId: uuidSchema,
    kind: correctionKindSchema,
    targetEventId: uuidSchema.optional(),
    proposedKind: stampKindSchema,
    proposedOccurredAt: z.string().datetime({ offset: true }),
    reason: z.string().min(3).max(500),
  })
  .refine((v) => v.kind === 'add' || Boolean(v.targetEventId), {
    message: 'targetEventId ist bei kind=correct erforderlich',
    path: ['targetEventId'],
  });
export type CreateCorrectionRequest = z.infer<typeof createCorrectionRequestSchema>;

/** Optionale Notiz bei Freigabe/Ablehnung. */
export const correctionDecisionSchema = z.object({ note: z.string().max(500).optional() });
export type CorrectionDecision = z.infer<typeof correctionDecisionSchema>;
