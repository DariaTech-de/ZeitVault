import { type DayWorkSummary, summarizeWeeks } from './weekly';
import type { RulePackage } from './types';

/**
 * C-10: Abgrenzung Ueberstunden vs. Mehrarbeit - davon haengt die
 * Zuschlagspflicht ab. Zwei GETRENNTE Zaehler je Kalenderwoche:
 * - UEBERSTUNDEN (`overtimeMinutes`): Arbeit ueber die VERTRAGLICH
 *   vereinbarte Wochenarbeitszeit hinaus (`contractualWeeklyMinutes`,
 *   Regelschicht-Parameter; pro Tarifvertrag konfigurierbar, B-08/B-09).
 *   0 = nicht konfiguriert -> Zaehler ist `null` (nicht "0 Ueberstunden":
 *   ohne Vertragsmass ist die Aussage nicht ableitbar).
 * - MEHRARBEIT (`extraWorkMinutes`): Arbeit ueber die gesetzliche/tarifliche
 *   HOECHSTarbeitszeit hinaus (`maxWeeklyMinutes`).
 * Hinweis: Zusammenfassung arbeitsrechtlicher Begriffe, ersetzt keine
 * Rechtsberatung.
 */
export interface OvertimeWeekSummary {
  /** Montag der Kalenderwoche (YYYY-MM-DD). */
  weekStart: string;
  workedMinutes: number;
  /** Vertragliche Wochenarbeitszeit (0 = nicht konfiguriert). */
  contractualWeeklyMinutes: number;
  /** Ueberstunden ueber das Vertragsmass; null, wenn kein Vertragsmass konfiguriert ist. */
  overtimeMinutes: number | null;
  /** Hoechstarbeitszeit-Grenze der Woche. */
  maxWeeklyMinutes: number;
  /** Mehrarbeit ueber die Hoechstarbeitszeit. */
  extraWorkMinutes: number;
}

/** Wochenzaehler Ueberstunden/Mehrarbeit ueber die geladenen Abrechnungstage. */
export function summarizeOvertime(
  days: readonly DayWorkSummary[],
  packageFor: (isoDate: string) => RulePackage,
): OvertimeWeekSummary[] {
  return summarizeWeeks(days, packageFor).map((week) => {
    const contractual = packageFor(week.lastDate).params.contractualWeeklyMinutes;
    return {
      weekStart: week.weekStart,
      workedMinutes: week.workedMinutes,
      contractualWeeklyMinutes: contractual,
      overtimeMinutes: contractual > 0 ? Math.max(0, week.workedMinutes - contractual) : null,
      maxWeeklyMinutes: week.limitMinutes,
      extraWorkMinutes: Math.max(0, week.workedMinutes - week.limitMinutes),
    };
  });
}
