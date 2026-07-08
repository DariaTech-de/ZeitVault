import { addIsoDays } from '../localtime/localtime';
import { dayOfWeek } from '../surcharge/compute';
import type { Finding, RulePackage } from './types';
import type { DayWorkSummary } from './weekly';

/**
 * Sonn- und Feiertagsruhe (B-06, §§ 9-11 ArbZG):
 *
 * - Mindestens `minFreeSundaysPerYear` (15) beschaeftigungsfreie Sonntage im
 *   Kalenderjahr: sobald so viele Sonntage gearbeitet wurden, dass die 15
 *   nicht mehr erreichbar sind, ist das ein sicherer Verstoss.
 * - Ersatzruhetag: Sonntagsarbeit verlangt einen beschaeftigungsfreien
 *   WERKTAG (Mo-Sa) innerhalb von `sundayCompensationDays` (2 Wochen),
 *   Feiertagsarbeit an einem Werktag innerhalb von
 *   `holidayCompensationDays` (8 Wochen). Ein zukuenftiger Kalendertag ist
 *   noch kein gewaehrter Ersatzruhetag - vor Fristablauf wird deshalb
 *   GEWARNT (PENDING mit Frist), nach Fristablauf ohne freien Werktag ist
 *   es ein Verstoss (MISSING).
 *
 * Beschaeftigungsfrei = kein Abrechnungstag mit Arbeitsminuten. Feiertage
 * kommen einsatzortscharf vom Aufrufer (`isHoliday`, C-08).
 *
 * > Hinweis: ersetzt keine Rechtsberatung.
 */
/** Anzahl der Sonntage eines Kalenderjahres (52 oder 53). */
function sundaysInYear(year: string): number {
  let first = `${year}-01-01`;
  while (dayOfWeek(first) !== 0) first = addIsoDays(first, 1);
  let count = 0;
  for (let d = first; d <= `${year}-12-31`; d = addIsoDays(d, 7)) count += 1;
  return count;
}

export function evaluateSundayHolidayRest(
  days: readonly DayWorkSummary[],
  isHoliday: (isoDate: string) => boolean,
  packageFor: (isoDate: string) => RulePackage,
  today: string,
): Array<{ date: string; finding: Finding }> {
  const worked = new Map(days.filter((d) => d.workedMinutes > 0).map((d) => [d.date, d.workedMinutes]));
  const results: Array<{ date: string; finding: Finding }> = [];

  const freeWorkdayIn = (fromExclusive: string, deadline: string): boolean => {
    const searchEnd = deadline < today ? deadline : today;
    for (let date = addIsoDays(fromExclusive, 1); date <= searchEnd; date = addIsoDays(date, 1)) {
      if (dayOfWeek(date) !== 0 && !worked.has(date)) return true;
    }
    return false;
  };

  const compensation = (
    workDate: string,
    deadlineDays: number,
    missing: 'SUNDAY_COMPENSATION_MISSING' | 'HOLIDAY_COMPENSATION_MISSING',
    pending: 'SUNDAY_COMPENSATION_PENDING' | 'HOLIDAY_COMPENSATION_PENDING',
    label: string,
  ): void => {
    const deadline = addIsoDays(workDate, deadlineDays);
    if (freeWorkdayIn(workDate, deadline)) return;
    if (today > deadline) {
      results.push({
        date: workDate,
        finding: {
          code: missing,
          severity: 'violation',
          message: `${label} am ${workDate} ohne Ersatzruhetag (beschäftigungsfreier Werktag) innerhalb der Frist bis ${deadline} (§ 11 Abs. 3 ArbZG).`,
          details: { compensationDeadlineDays: deadlineDays },
        },
      });
    } else {
      results.push({
        date: workDate,
        finding: {
          code: pending,
          severity: 'warning',
          message: `${label} am ${workDate}: Ersatzruhetag steht aus (Frist bis ${deadline}).`,
          details: { compensationDeadlineDays: deadlineDays },
        },
      });
    }
  };

  const workedSundaysByYear = new Map<string, number>();
  const flaggedYears = new Set<string>();
  const sortedWorked = [...worked.keys()].sort();
  for (const date of sortedWorked) {
    const params = packageFor(date).params;
    if (dayOfWeek(date) === 0) {
      compensation(
        date,
        params.sundayCompensationDays,
        'SUNDAY_COMPENSATION_MISSING',
        'SUNDAY_COMPENSATION_PENDING',
        'Sonntagsarbeit',
      );
      const year = date.slice(0, 4);
      const count = (workedSundaysByYear.get(year) ?? 0) + 1;
      workedSundaysByYear.set(year, count);
      const totalSundays = sundaysInYear(year);
      if (!flaggedYears.has(year) && count > totalSundays - params.minFreeSundaysPerYear) {
        flaggedYears.add(year);
        results.push({
          date,
          finding: {
            code: 'MIN_FREE_SUNDAYS_UNREACHABLE',
            severity: 'violation',
            message: `Mit dieser Sonntagsarbeit sind die mindestens ${params.minFreeSundaysPerYear} beschäftigungsfreien Sonntage im Jahr ${year} nicht mehr erreichbar (§ 11 Abs. 1 ArbZG).`,
            details: {
              workedSundays: count,
              totalSundays,
              minFreeSundaysPerYear: params.minFreeSundaysPerYear,
            },
          },
        });
      }
    } else if (isHoliday(date)) {
      compensation(
        date,
        params.holidayCompensationDays,
        'HOLIDAY_COMPENSATION_MISSING',
        'HOLIDAY_COMPENSATION_PENDING',
        'Feiertagsarbeit',
      );
    }
  }
  return results;
}
