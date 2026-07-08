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
    averagingPeriodMonths: 6,
    averagingPeriodWeeks: 0,
    nightWorkerAveragingPeriodMonths: 1,
    nightWorkerAveragingPeriodWeeks: 0,
    restCompensationBaselineMinutes: 11 * 60,
    restCompensationMinutes: 12 * 60,
    restCompensationPeriodMonths: 1,
    restCompensationPeriodWeeks: 0,
    allowedWorkStartMinute: 0,
    allowedWorkEndMinute: 24 * 60,
    // B-12: Rundung NIE als Voreinstellung - nur per BV-Regelsatz.
    roundingClockIn: 'none',
    roundingBreakStart: 'none',
    roundingBreakEnd: 'none',
    roundingClockOut: 'none',
    // System-Grundwert der Kulanzfrist (ADR-0019); abweichend nur per TV/BV.
    openShiftGraceMinutes: 16 * 60,
  },
};

/**
 * JArbSchG-Regelpaket (B-07, Stand 2026) fuer Beschaeftigte unter 18:
 * 8 h/Tag UND 40 h/Woche (beide Massstaebe hart), Pausen 30 min bei mehr als
 * 4,5 h und 60 min bei mehr als 6 h (§ 11, Abschnitte >= 15 min, laenger als
 * 4,5 h nicht ohne Pause), 12 h Freizeit (§ 13), Beschaeftigung nur
 * 06:00-20:00 Uhr (§ 14 Nachtruhe). Aktivierung automatisch ueber das
 * Geburtsdatum (selectLawPackage); Umschaltung am 18. Geburtstag.
 *
 * > Hinweis: ersetzt keine Rechtsberatung; Branchen-Ausnahmen des JArbSchG
 * > werden bei Bedarf als eigene datierte Pakete gepflegt (ADR-0009).
 */
export const JARBSCHG_2026_V1: RulePackage = {
  id: 'jarbschg.de',
  version: '2026.1',
  validFrom: '2026-01-01',
  validTo: null,
  params: {
    maxDailyMinutesStandard: 8 * 60,
    maxDailyMinutesExtended: 8 * 60,
    minRestMinutes: 12 * 60,
    breakThreshold1Minutes: 4 * 60 + 30,
    breakMinutesTier1: 30,
    breakThreshold2Minutes: 6 * 60,
    breakMinutesTier2: 60,
    breakMinSegmentMinutes: 15,
    maxContinuousWorkMinutes: 4 * 60 + 30,
    arbzgNightStartMinute: 23 * 60,
    arbzgNightEndMinute: 6 * 60,
    maxWeeklyMinutes: 40 * 60,
    maxWorkingTimeMode: 'daily_and_weekly',
    averagingPeriodMonths: 1,
    averagingPeriodWeeks: 0,
    nightWorkerAveragingPeriodMonths: 1,
    nightWorkerAveragingPeriodWeeks: 0,
    restCompensationBaselineMinutes: 12 * 60,
    restCompensationMinutes: 12 * 60,
    restCompensationPeriodMonths: 1,
    restCompensationPeriodWeeks: 0,
    allowedWorkStartMinute: 6 * 60,
    allowedWorkEndMinute: 20 * 60,
    roundingClockIn: 'none',
    roundingBreakStart: 'none',
    roundingBreakEnd: 'none',
    roundingClockOut: 'none',
    openShiftGraceMinutes: 16 * 60,
  },
};

export const DEFAULT_RULE_PACKAGES: readonly RulePackage[] = [ARBZG_2026_V1];
export const MINOR_RULE_PACKAGES: readonly RulePackage[] = [JARBSCHG_2026_V1];

/**
 * Gesetzes-Baseline fuer Mitarbeitende + Datum (B-07): unter 18 Jahren gilt
 * das JArbSchG-Paket, ab dem 18. Geburtstag automatisch das ArbZG. Ohne
 * Geburtsdatum (Datensparsamkeit: optionales Stammdatum, Zweckbindung
 * JArbSchG-Automatik) gilt das Erwachsenen-Paket.
 */
export function selectLawPackage(
  isoDate: string,
  birthDate?: string | null,
): RulePackage | null {
  if (birthDate) {
    const [y, m, d] = birthDate.split('-').map(Number);
    const cutoff = new Date(Date.UTC(y! + 18, m! - 1, d!)).toISOString().slice(0, 10);
    if (isoDate < cutoff) {
      return selectRulePackage(MINOR_RULE_PACKAGES, isoDate) ?? JARBSCHG_2026_V1;
    }
  }
  return selectRulePackage(DEFAULT_RULE_PACKAGES, isoDate);
}

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
