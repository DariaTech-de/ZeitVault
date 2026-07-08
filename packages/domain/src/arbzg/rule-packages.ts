import type { RulePackage } from './types';

/**
 * Standard-ArbZG-Regelpaket (Stand 2026): 8 h regulaer / 10 h mit Ausgleich,
 * 11 h Ruhezeit, Pausen 30 min bei MEHR ALS 6 h und 45 min bei MEHR ALS 9 h
 * (§ 4 Satz 1, strikte Schwellen), Pausenabschnitte je >= 15 min (Satz 2),
 * max. 6 h hintereinander ohne Ruhepause (Satz 3).
 *
 * Aenderungen der Rechtslage (z. B. Umstieg auf eine woechentliche
 * Hoechstarbeitszeit) werden als NEUES, datiertes Regelpaket eingepflegt -
 * ohne Code-Umbau und ohne Datenmigration (ADR-0009, ARCHITEKTUR.md Paragraf 3.2/10).
 */
export const ARBZG_2026_V1: RulePackage = {
  id: 'arbzg.de',
  version: '2026.1',
  validFrom: '2026-01-01',
  validTo: null,
  params: {
    maxDailyMinutesStandard: 8 * 60,
    maxDailyMinutesExtended: 10 * 60,
    minRestMinutes: 11 * 60,
    breakThreshold1Minutes: 6 * 60,
    breakMinutesTier1: 30,
    breakThreshold2Minutes: 9 * 60,
    breakMinutesTier2: 45,
    breakMinSegmentMinutes: 15,
    maxContinuousWorkMinutes: 6 * 60,
    arbzgNightStartMinute: 23 * 60,
    arbzgNightEndMinute: 6 * 60,
    maxWeeklyMinutes: 48 * 60,
    maxWorkingTimeMode: 'daily',
    // B-12: Rundung NIE als Voreinstellung - nur per BV-Regelsatz.
    roundingClockIn: 'none',
    roundingBreakStart: 'none',
    roundingBreakEnd: 'none',
    roundingClockOut: 'none',
    // System-Grundwert der Kulanzfrist (ADR-0019); abweichend nur per TV/BV.
    openShiftGraceMinutes: 16 * 60,
  },
};

export const DEFAULT_RULE_PACKAGES: readonly RulePackage[] = [ARBZG_2026_V1];

/**
 * Waehlt das fuer ein Datum (YYYY-MM-DD) gueltige Regelpaket. Bei mehreren
 * gueltigen Paketen gewinnt das mit dem juengsten `validFrom`. So lassen sich
 * Gesetzesaenderungen ueber datierte Regelpakete abbilden.
 */
export function selectRulePackage(
  packages: readonly RulePackage[],
  isoDate: string,
): RulePackage | null {
  let selected: RulePackage | null = null;
  for (const pkg of packages) {
    const inRange = pkg.validFrom <= isoDate && (pkg.validTo === null || pkg.validTo >= isoDate);
    if (!inRange) continue;
    if (selected === null || pkg.validFrom >= selected.validFrom) {
      selected = pkg;
    }
  }
  return selected;
}
