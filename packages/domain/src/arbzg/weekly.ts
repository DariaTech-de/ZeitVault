import { dayOfWeek } from '../surcharge/compute';
import { addIsoDays } from '../localtime/localtime';
import type { Finding, RulePackage } from './types';

/**
 * Woechentliche Hoechstarbeitszeit (B-11): wird PARALLEL zur taeglichen
 * Grenze berechnet (Rechtsstand-Abschnitt der Spezifikation: Referentenentwurf
 * BMAS, woechentliche statt taeglicher Hoechstarbeitszeit per Tarifvertrag).
 * Welcher Massstab BEFUNDE erzeugt, schaltet `maxWorkingTimeMode`:
 * - 'daily' (heutiges ArbZG): Tagesmaxima melden; Wochensummen werden nur
 *   berechnet und ausgewiesen.
 * - 'weekly' (tarifgebunden, gruppen-gescopte Regelsaetze): einzelne Tage
 *   duerfen laenger sein, dafuer gilt die Wochengrenze `maxWeeklyMinutes`.
 * Woche = Kalenderwoche ab Montag; bewertet werden die im Zeitraum geladenen
 * Tage (eine Teil-Woche ueber der Grenze ist bereits ein sicherer Verstoss).
 */

export interface DayWorkSummary {
  /** Abrechnungstag (YYYY-MM-DD). */
  date: string;
  workedMinutes: number;
}

export interface WeeklyWorkSummary {
  /** Montag der Kalenderwoche (YYYY-MM-DD). */
  weekStart: string;
  /** Letzter geladener Abrechnungstag der Woche. */
  lastDate: string;
  workedMinutes: number;
  limitMinutes: number;
  mode: 'daily' | 'weekly';
}

/** Montag der Kalenderwoche eines ISO-Datums (dayOfWeek: 0 = Sonntag). */
export function weekStartOf(isoDate: string): string {
  return addIsoDays(isoDate, -((dayOfWeek(isoDate) + 6) % 7));
}

/** Wochensummen ueber die geladenen Abrechnungstage (immer berechnet). */
export function summarizeWeeks(
  days: readonly DayWorkSummary[],
  packageFor: (isoDate: string) => RulePackage,
): WeeklyWorkSummary[] {
  const byWeek = new Map<string, DayWorkSummary[]>();
  for (const day of days) {
    const week = weekStartOf(day.date);
    const bucket = byWeek.get(week) ?? [];
    bucket.push(day);
    byWeek.set(week, bucket);
  }
  return [...byWeek.keys()].sort().map((weekStart) => {
    const weekDays = byWeek.get(weekStart)!.sort((a, b) => (a.date < b.date ? -1 : 1));
    const lastDate = weekDays.at(-1)!.date;
    const params = packageFor(lastDate).params;
    return {
      weekStart,
      lastDate,
      workedMinutes: weekDays.reduce((s, d) => s + d.workedMinutes, 0),
      limitMinutes: params.maxWeeklyMinutes,
      mode: params.maxWorkingTimeMode,
    };
  });
}

/**
 * Wochenbefunde: nur im 'weekly'-Modus; der Befund haengt am letzten
 * geladenen Tag der Woche.
 */
export function evaluateWeeklyWorkTime(
  days: readonly DayWorkSummary[],
  packageFor: (isoDate: string) => RulePackage,
): Array<{ date: string; finding: Finding }> {
  const results: Array<{ date: string; finding: Finding }> = [];
  for (const week of summarizeWeeks(days, packageFor)) {
    if (week.mode !== 'weekly') continue;
    if (week.workedMinutes > week.limitMinutes) {
      results.push({
        date: week.lastDate,
        finding: {
          code: 'MAX_WEEKLY_WORKTIME_EXCEEDED',
          severity: 'violation',
          message: `Wöchentliche Höchstarbeitszeit von ${week.limitMinutes / 60} h überschritten (KW ab ${week.weekStart}).`,
          details: {
            weeklyWorkedMinutes: week.workedMinutes,
            limitMinutes: week.limitMinutes,
          },
        },
      });
    }
  }
  return results;
}
