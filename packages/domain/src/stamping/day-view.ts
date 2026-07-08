import { evaluateWorkDay, totalMinutes } from '../arbzg/engine';
import type { BreakInterval, Finding, RulePackage, WorkInterval } from '../arbzg/types';
import {
  type Shift,
  foldShifts,
  materializeShift,
  shiftAccountingDay,
} from './shifts';
import type { StampEvent } from './types';

/**
 * Bewertete Sicht eines Abrechnungstags (ADR-0018): alle Schichten, deren
 * lokaler Beginn auf diesen Kalendertag faellt, inkl. ArbZG-Befunden. Die
 * Ruhezeit wird ueber die Tagessequenz hinweg mit dem Ende der jeweils vorigen
 * Schicht verkettet (B-03/K-03).
 */
export interface AccountingDay {
  /** Lokaler Kalendertag (YYYY-MM-DD) in der Zeitzone des Einsatzortes. */
  date: string;
  workedMinutes: number;
  breakMinutes: number;
  findings: Finding[];
  shifts: Shift[];
}

/**
 * Gemeinsame Tagessicht fuer Stempeln (Live-Befunde), Heute-Ansicht, Report
 * und Export: faltet Ereignisse zu Schichten, ordnet sie ihrem Abrechnungstag
 * zu (lokaler Tag des Schichtbeginns, ADR-0018) und bewertet jeden Tag gegen
 * das Regelpaket. Offene Schichten werden zu `now` materialisiert.
 */
export function buildAccountingDays(
  events: readonly StampEvent[],
  timeZone: string,
  rulePackage: RulePackage,
  now: Date,
): AccountingDay[] {
  const shifts = foldShifts(events);
  const byDay = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const day = shiftAccountingDay(shift, timeZone);
    const bucket = byDay.get(day) ?? [];
    bucket.push(shift);
    byDay.set(day, bucket);
  }

  const days: AccountingDay[] = [];
  let previousShiftEnd: Date | null = null;
  for (const date of [...byDay.keys()].sort()) {
    const dayShifts = byDay.get(date) ?? [];
    const workIntervals: WorkInterval[] = [];
    const breakIntervals: BreakInterval[] = [];
    for (const shift of dayShifts) {
      const m = materializeShift(shift, now);
      workIntervals.push(...m.workIntervals);
      breakIntervals.push(...m.breakIntervals);
    }
    const findings = evaluateWorkDay(
      { date, intervals: workIntervals, breaks: breakIntervals, previousShiftEnd },
      rulePackage,
    );
    days.push({
      date,
      workedMinutes: totalMinutes(workIntervals),
      breakMinutes: totalMinutes(breakIntervals),
      findings,
      shifts: dayShifts,
    });
    const lastEnd = dayShifts.at(-1)?.endAt;
    if (lastEnd) previousShiftEnd = lastEnd;
  }
  return days;
}
