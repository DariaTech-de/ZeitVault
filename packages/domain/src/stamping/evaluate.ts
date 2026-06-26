import { evaluateWorkDay, totalMinutes } from '../arbzg/engine';
import type { Finding, RulePackage } from '../arbzg/types';
import { foldStampDay, materializeStampDay, resolveEffectiveEvents } from './fold';
import type { StampEvent, StampState } from './types';

export interface StampStatus {
  state: StampState;
  workedMinutes: number;
  breakMinutes: number;
}

/** Aktueller Status (Zustand + bisher gearbeitete/pausierte Minuten) "Stand jetzt". */
export function computeStampStatus(events: readonly StampEvent[], now: Date): StampStatus {
  const fold = foldStampDay(resolveEffectiveEvents(events));
  const { workIntervals, breakIntervals } = materializeStampDay(fold, now);
  return {
    state: fold.state,
    workedMinutes: totalMinutes(workIntervals),
    breakMinutes: totalMinutes(breakIntervals),
  };
}

/**
 * Live-Bewertung des laufenden Tages gegen ein ArbZG-Regelpaket: liefert
 * Warnungen/Verstoesse beim Stempeln (ARCHITEKTUR.md Paragraf 3.2/10).
 */
export function evaluateStampDay(
  events: readonly StampEvent[],
  rulePackage: RulePackage,
  now: Date,
  options: { date: string; previousShiftEnd?: Date | null },
): Finding[] {
  const fold = foldStampDay(resolveEffectiveEvents(events));
  const { workIntervals, breakIntervals } = materializeStampDay(fold, now);
  return evaluateWorkDay(
    {
      date: options.date,
      intervals: workIntervals,
      breaks: breakIntervals,
      previousShiftEnd: options.previousShiftEnd ?? null,
    },
    rulePackage,
  );
}
