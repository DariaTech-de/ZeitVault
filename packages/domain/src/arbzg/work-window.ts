import { sliceIntervalByLocalDay } from '../localtime/localtime';
import type { ArbZgRuleParams, Finding, WorkInterval } from './types';

/**
 * Zulaessiges Beschaeftigungsfenster (B-07, JArbSchG § 14 Nachtruhe):
 * Arbeitsanteile ausserhalb [allowedWorkStartMinute, allowedWorkEndMinute)
 * (lokale Wanduhrzeit) sind ein Verstoss. Erwachsenen-Pakete setzen 0/1440
 * und melden nie. Bewertet wird je lokaler Tages-Scheibe des Intervalls.
 */
export function evaluateAllowedWorkWindow(
  intervals: readonly WorkInterval[],
  timeZone: string,
  params: ArbZgRuleParams,
): Finding[] {
  const { allowedWorkStartMinute: start, allowedWorkEndMinute: end } = params;
  if (start <= 0 && end >= 24 * 60) return [];
  let outsideMinutes = 0;
  for (const interval of intervals) {
    for (const slice of sliceIntervalByLocalDay(interval, timeZone)) {
      const sliceEnd = slice.startMinute + slice.minutes;
      const before = Math.max(0, Math.min(sliceEnd, start) - slice.startMinute);
      const after = Math.max(0, sliceEnd - Math.max(slice.startMinute, end));
      outsideMinutes += Math.min(slice.minutes, before + after);
    }
  }
  if (outsideMinutes <= 0) return [];
  return [
    {
      code: 'WORK_OUTSIDE_ALLOWED_WINDOW',
      severity: 'violation',
      message:
        'Arbeit außerhalb des zulässigen Beschäftigungsfensters ' +
        `(${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}-` +
        `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')} Uhr, JArbSchG).`,
      details: {
        outsideMinutes,
        allowedStartMinute: start,
        allowedEndMinute: end,
      },
    },
  ];
}
