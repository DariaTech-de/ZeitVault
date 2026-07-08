import { addIsoDays } from '../localtime/localtime';
import { dayOfWeek } from '../surcharge/compute';
import type { ArbZgRuleParams, Finding, RulePackage } from './types';
import type { DayWorkSummary } from './weekly';

/**
 * Ausgleichsdurchschnitte (B-01/B-04):
 *
 * - § 3 ArbZG: Verlaengerung auf 10 h nur, wenn innerhalb von 6
 *   Kalendermonaten ODER 24 Wochen im Durchschnitt 8 h WERKTAEGLICH
 *   (Werktag = Mo-Sa) nicht ueberschritten werden. Der Zeitraum ist je
 *   Regelwerk konfigurierbar: `averagingPeriodMonths` ODER
 *   `averagingPeriodWeeks` (genau einer > 0).
 * - § 6 Abs. 2 ArbZG (B-04): Fuer NACHTARBEITNEHMER gilt eine KUERZERE
 *   Periode (1 Kalendermonat / 4 Wochen) - eigene Parameter
 *   `nightWorkerAveragingPeriodMonths`/`...Weeks`. Das Kennzeichen
 *   `night_worker` ist ein Stammdatum (§ 2 Abs. 5; Pflege durch HR).
 *
 * Durchschnitt = Summe der Arbeitsminuten im Fenster / Anzahl der
 * Mo-Sa-Tage im Fenster (Feiertage zaehlen als Werktage mit; die
 * einsatzortscharfe Feiertagsbereinigung folgt mit der C-08-Integration).
 * Das Fenster endet am Bewertungsdatum (inklusive) und wird rueckblickend
 * gemessen - eine Ueberschreitung ist damit ein sicherer Verstoss, kein
 * Verdacht.
 *
 * > Hinweis: ersetzt keine Rechtsberatung.
 */

/** Kalenderfenster (inklusive Grenzen) fuer den Durchschnitt zum Datum `to`. */
export function averagingWindow(
  to: string,
  params: ArbZgRuleParams,
  nightWorker: boolean,
): { from: string; to: string } {
  const months = nightWorker ? params.nightWorkerAveragingPeriodMonths : params.averagingPeriodMonths;
  const weeks = nightWorker ? params.nightWorkerAveragingPeriodWeeks : params.averagingPeriodWeeks;
  if (months > 0) {
    const [y, m, d] = to.split('-').map(Number);
    const start = new Date(Date.UTC(y!, m! - 1 - months, d!));
    return { from: addIsoDays(start.toISOString().slice(0, 10), 1), to };
  }
  return { from: addIsoDays(to, -(weeks * 7) + 1), to };
}

/** Anzahl der Werktage (Mo-Sa) im Fenster [from, to]. */
function workingDayCount(from: string, to: string): number {
  let count = 0;
  for (let date = from; date <= to; date = addIsoDays(date, 1)) {
    if (dayOfWeek(date) !== 0) count += 1;
  }
  return count;
}

/**
 * Prueft den werktaeglichen 8-h-Durchschnitt zum Datum `rangeTo` (B-01;
 * fuer Nachtarbeitnehmer mit der kuerzeren Periode, B-04).
 */
export function evaluateWorkingTimeAverage(
  days: readonly DayWorkSummary[],
  rangeTo: string,
  packageFor: (isoDate: string) => RulePackage,
  nightWorker: boolean,
): Finding[] {
  const params = packageFor(rangeTo).params;
  const window = averagingWindow(rangeTo, params, nightWorker);
  const workedMinutes = days
    .filter((d) => d.date >= window.from && d.date <= window.to)
    .reduce((s, d) => s + d.workedMinutes, 0);
  const workingDays = workingDayCount(window.from, window.to);
  if (workingDays === 0) return [];
  // Ganzzahlige Vergleichsarithmetik statt Bruchminuten (B-12):
  // avg > 8h  <=>  worked > 480 * werktage.
  const limitMinutes = params.maxDailyMinutesStandard * workingDays;
  if (workedMinutes <= limitMinutes) return [];
  return [
    {
      code: 'AVERAGING_LIMIT_EXCEEDED',
      severity: 'violation',
      message: nightWorker
        ? `Werktäglicher 8-h-Durchschnitt für Nachtarbeitnehmer überschritten (Ausgleichszeitraum bis ${window.from} zurück, § 6 Abs. 2 ArbZG).`
        : `Werktäglicher 8-h-Durchschnitt im Ausgleichszeitraum überschritten (§ 3 ArbZG).`,
      details: {
        windowWorkedMinutes: workedMinutes,
        windowWorkingDays: workingDays,
        limitMinutes,
      },
    },
  ];
}
