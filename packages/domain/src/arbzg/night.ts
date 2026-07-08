import type { ArbZgRuleParams } from './types';

/**
 * Nachtzeit-Definitionen (B-05): ZWEI verschiedene Rechtsbegriffe, die nie
 * vermischt werden duerfen.
 *
 * - ArbZG § 2 Abs. 3 (Arbeitsschutz): 23:00-06:00 Uhr; in Baeckereien und
 *   Konditoreien 22:00-05:00 Uhr. Im Regelwerk als Parameter
 *   `arbzgNightStartMinute`/`arbzgNightEndMinute` (Branchen-Abweichung nur
 *   per TV-/BV-Regelsatz, B-08).
 * - § 3b EStG (steuerfreier Zuschlag): 20:00-06:00 Uhr. FEST - eine
 *   steuerrechtliche Groesse, kein Verhandlungsgegenstand; die Zuschlags-
 *   Saetze selbst leben im Zuschlagspaket (surcharge/rule-packages.ts).
 *
 * > Hinweis: ersetzt keine Rechtsberatung.
 */

/** § 3b EStG: Beginn des Zuschlagsfensters (20:00, Wanduhr-Minute). */
export const TAX_NIGHT_START_MINUTE = 20 * 60;
/** § 3b EStG: Ende des Zuschlagsfensters (06:00, exklusiv). */
export const TAX_NIGHT_END_MINUTE = 6 * 60;

/** Liegt eine Wanduhr-Minute in einem ggf. ueber Mitternacht laufenden Fenster? */
function inWindow(minuteOfDay: number, startMinute: number, endMinute: number): boolean {
  if (startMinute <= endMinute) {
    return minuteOfDay >= startMinute && minuteOfDay < endMinute;
  }
  return minuteOfDay >= startMinute || minuteOfDay < endMinute;
}

/** ArbZG-Nachtzeit (§ 2 Abs. 3): Fenster aus dem wirksamen Regelwerk. */
export function isArbzgNightWork(minuteOfDay: number, params: ArbZgRuleParams): boolean {
  return inWindow(minuteOfDay, params.arbzgNightStartMinute, params.arbzgNightEndMinute);
}

/** § 3b-EStG-Nachtfenster (20-6 Uhr) - unabhaengig vom ArbZG-Regelwerk. */
export function isTaxNightBonusMinute(minuteOfDay: number): boolean {
  return inWindow(minuteOfDay, TAX_NIGHT_START_MINUTE, TAX_NIGHT_END_MINUTE);
}

/** Beide Klassifikationen einer Wanduhr-Minute nebeneinander (B-05-AK). */
export function classifyNightMinute(
  minuteOfDay: number,
  params: ArbZgRuleParams,
): { arbzgNightWork: boolean; taxNightBonus: boolean } {
  return {
    arbzgNightWork: isArbzgNightWork(minuteOfDay, params),
    taxNightBonus: isTaxNightBonusMinute(minuteOfDay),
  };
}
