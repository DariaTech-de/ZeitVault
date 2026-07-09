import { z } from 'zod';
import { uuidSchema } from './common';

/**
 * Regelschicht (B-08/B-09/B-10): Tarifvertrag/Betriebsvereinbarung als
 * referenzierbares Objekt und persistente, versionierte Regelsaetze mit
 * Gueltigkeitszeitraum. `params` enthaelt NUR die abweichenden Parameter;
 * die Ebenen-/Guenstigkeitslogik liegt in `@zeitvault/domain` (layering.ts).
 */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');

export const collectiveAgreementKindSchema = z.enum(['collective_agreement', 'works_agreement']);
export type CollectiveAgreementKind = z.infer<typeof collectiveAgreementKindSchema>;

export const createCollectiveAgreementSchema = z
  .object({
    kind: collectiveAgreementKindSchema,
    name: z.string().min(1).max(200),
    /** Fundstelle/Aktenzeichen (z. B. "MTV Metall NRW, Abschluss 2026-06-15"). */
    reference: z.string().min(1).max(500).optional(),
    /** BV "aufgrund eines Tarifvertrags" (§ 7 ArbZG): ermaechtigender TV. */
    basedOnId: uuidSchema.optional(),
    validFrom: isoDateSchema,
    validTo: isoDateSchema.optional(),
  })
  .refine((v) => v.validTo === undefined || v.validFrom <= v.validTo, {
    message: 'validFrom muss <= validTo sein',
    path: ['validTo'],
  });
export type CreateCollectiveAgreement = z.infer<typeof createCollectiveAgreementSchema>;

export const ruleLayerSchema = z.enum(['collective_agreement', 'works_agreement', 'individual']);
export type RuleLayerInput = z.infer<typeof ruleLayerSchema>;

/** Abweichende Regelparameter (Teilmenge; alle Werte ganze Minuten >= 0). */
export const ruleParamsSchema = z
  .object({
    maxDailyMinutesStandard: z.number().int().min(0),
    maxDailyMinutesExtended: z.number().int().min(0),
    minRestMinutes: z.number().int().min(0),
    breakThreshold1Minutes: z.number().int().min(0),
    breakMinutesTier1: z.number().int().min(0),
    breakThreshold2Minutes: z.number().int().min(0),
    breakMinutesTier2: z.number().int().min(0),
    breakMinSegmentMinutes: z.number().int().min(0),
    maxContinuousWorkMinutes: z.number().int().min(0),
    openShiftGraceMinutes: z.number().int().min(0),
    arbzgNightStartMinute: z.number().int().min(0).max(1439),
    arbzgNightEndMinute: z.number().int().min(0).max(1439),
    maxWeeklyMinutes: z.number().int().min(0),
    contractualWeeklyMinutes: z.number().int().min(0),
    minFreeSundaysPerYear: z.number().int().min(0),
    sundayCompensationDays: z.number().int().min(0),
    holidayCompensationDays: z.number().int().min(0),
    restCompensationBaselineMinutes: z.number().int().min(0),
    restCompensationMinutes: z.number().int().min(0),
    restCompensationPeriodMonths: z.number().int().min(0),
    restCompensationPeriodWeeks: z.number().int().min(0),
    averagingPeriodMonths: z.number().int().min(0),
    averagingPeriodWeeks: z.number().int().min(0),
    nightWorkerAveragingPeriodMonths: z.number().int().min(0),
    nightWorkerAveragingPeriodWeeks: z.number().int().min(0),
    maxWorkingTimeMode: z.enum(['daily', 'weekly']),
    roundingClockIn: z.enum(['none', 'nearest_minute', 'down_minute', 'up_minute']),
    roundingBreakStart: z.enum(['none', 'nearest_minute', 'down_minute', 'up_minute']),
    roundingBreakEnd: z.enum(['none', 'nearest_minute', 'down_minute', 'up_minute']),
    roundingClockOut: z.enum(['none', 'nearest_minute', 'down_minute', 'up_minute']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Ein Regelsatz muss mindestens einen Parameter setzen.',
  });
export type RuleParamsInput = z.infer<typeof ruleParamsSchema>;

export const createEmployeeGroupSchema = z.object({ name: z.string().min(1).max(200) });
export type CreateEmployeeGroup = z.infer<typeof createEmployeeGroupSchema>;

export const assignEmployeeGroupSchema = z
  .object({
    groupId: uuidSchema,
    employeeId: uuidSchema,
    validFrom: isoDateSchema,
    validTo: isoDateSchema.optional(),
  })
  .refine((v) => v.validTo === undefined || v.validFrom <= v.validTo, {
    message: 'validFrom muss <= validTo sein',
    path: ['validTo'],
  });
export type AssignEmployeeGroup = z.infer<typeof assignEmployeeGroupSchema>;

export const createRuleSetSchema = z
  .object({
    name: z.string().min(1).max(200),
    layer: ruleLayerSchema,
    /** Pflicht fuer TV-/BV-Ebene (B-08); Service erzwingt Existenz + Ebene. */
    collectiveAgreementId: uuidSchema.optional(),
    /** Pflicht fuer die individuelle Ebene. */
    employeeId: uuidSchema.optional(),
    /** Gruppen-Scope (B-11): Regelsatz gilt nur fuer Mitglieder der Gruppe. */
    employeeGroupId: uuidSchema.optional(),
    validFrom: isoDateSchema,
    validTo: isoDateSchema.optional(),
    params: ruleParamsSchema,
  })
  .refine((v) => v.validTo === undefined || v.validFrom <= v.validTo, {
    message: 'validFrom muss <= validTo sein',
    path: ['validTo'],
  })
  .refine((v) => v.layer === 'individual' || v.collectiveAgreementId !== undefined, {
    message:
      'Abweichende Regelsaetze der Ebenen Tarifvertrag/Betriebsvereinbarung erfordern eine collective_agreement-Referenz (B-08).',
    path: ['collectiveAgreementId'],
  })
  .refine((v) => v.layer !== 'individual' || v.employeeId !== undefined, {
    message: 'Individuelle Regelsaetze erfordern employeeId.',
    path: ['employeeId'],
  })
  .refine((v) => v.layer !== 'individual' || v.employeeGroupId === undefined, {
    message: 'Individuelle Regelsaetze sind personenbezogen (kein Gruppen-Scope).',
    path: ['employeeGroupId'],
  });
export type CreateRuleSet = z.infer<typeof createRuleSetSchema>;
