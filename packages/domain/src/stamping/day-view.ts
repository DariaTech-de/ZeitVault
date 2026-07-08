import { evaluateWorkDay, totalMinutes } from '../arbzg/engine';
import type { BreakInterval, Finding, RulePackage, WorkInterval } from '../arbzg/types';
import {
  type Shift,
  foldShifts,
  materializeShift,
  shiftAccountingDay,
  shiftLastEventAt,
  shiftResolution,
} from './shifts';
import type { StampEvent } from './types';

/**
 * Bewertete Sicht eines Abrechnungstags (ADR-0018): alle Schichten, deren
 * lokaler Beginn auf diesen Kalendertag faellt, inkl. ArbZG-Befunden. Die
 * Ruhezeit wird ueber die Tagessequenz hinweg mit dem Ende der jeweils vorigen
 * Schicht verkettet (B-03/K-03); bei unaufgeloesten Vorschichten (ADR-0019)
 * mit deren Untergrenze (`workedAtLeastUntil`).
 */
export interface AccountingDay {
  /** Lokaler Kalendertag (YYYY-MM-DD) in der Zeitzone des Einsatzortes. */
  date: string;
  /**
   * Gearbeitete Minuten; enthaelt bei unaufgeloesten Schichten nur die durch
   * Ereignisse abgeschlossenen Intervalle (UNTERGRENZE, ADR-0019).
   */
  workedMinutes: number;
  breakMinutes: number;
  findings: Finding[];
  shifts: Shift[];
}

/**
 * Gemeinsame Tagessicht fuer Stempeln (Live-Befunde), Heute-Ansicht, Report
 * und Export: faltet Ereignisse zu Schichten, ordnet sie ihrem Abrechnungstag
 * zu (lokaler Tag des Schichtbeginns, ADR-0018) und bewertet jeden Tag gegen
 * das Regelpaket. Laufende Schichten werden zu `now` materialisiert;
 * unaufgeloeste Schichten (ADR-0019) NICHT - sie erhalten den Befund
 * SHIFT_UNRESOLVED und zaehlen nur mit ihrer Untergrenze.
 *
 * `rulePackage` kann eine Funktion je Abrechnungstag sein (B-09/B-10): dann
 * wird jeder Tag gegen das an DIESEM Datum wirksame Paket bewertet (inkl.
 * Kulanzfrist `openShiftGraceMinutes`) - Grundlage fuer datumsabhaengige
 * Regelsaetze und rueckwirkende Neubewertung.
 */
export function buildAccountingDays(
  events: readonly StampEvent[],
  timeZone: string,
  rulePackage: RulePackage | ((isoDate: string) => RulePackage),
  now: Date,
): AccountingDay[] {
  const packageFor = typeof rulePackage === 'function' ? rulePackage : () => rulePackage;
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
  let previousEndIsLowerBound = false;
  for (const date of [...byDay.keys()].sort()) {
    const pkg = packageFor(date);
    const graceMs = pkg.params.openShiftGraceMinutes * 60_000;
    const dayShifts = byDay.get(date) ?? [];
    const workIntervals: WorkInterval[] = [];
    const breakIntervals: BreakInterval[] = [];
    const unresolvedShifts: Shift[] = [];
    for (const shift of dayShifts) {
      const m = materializeShift(shift, now, graceMs);
      workIntervals.push(...m.workIntervals);
      breakIntervals.push(...m.breakIntervals);
      if (shiftResolution(shift, now, graceMs) === 'unresolved') {
        unresolvedShifts.push(shift);
      }
    }
    const findings = evaluateWorkDay(
      {
        date,
        intervals: workIntervals,
        breaks: breakIntervals,
        previousShiftEnd,
        previousShiftEndIsLowerBound: previousEndIsLowerBound,
      },
      pkg,
    );
    // ADR-0019: Der Tag ist nicht abschliessend pruefbar - die Arbeitszeit ist
    // eine Untergrenze ("mindestens bis"), niemals "eingehalten" behaupten.
    for (const shift of unresolvedShifts) {
      const atLeastUntil = shift.workedAtLeastUntil ?? shiftLastEventAt(shift);
      findings.push({
        code: 'SHIFT_UNRESOLVED',
        severity: 'warning',
        message:
          'Schichtende unbekannt (kein Ausstempeln): Arbeitszeit ist eine Untergrenze ' +
          '(mindestens bis zum letzten Ereignis); Auflösung per Anpassungsantrag erforderlich.',
        details: {
          shiftStartMs: shift.startAt.getTime(),
          workedAtLeastUntilMs: atLeastUntil.getTime(),
        },
      });
    }
    days.push({
      date,
      workedMinutes: totalMinutes(workIntervals),
      breakMinutes: totalMinutes(breakIntervals),
      findings,
      shifts: dayShifts,
    });
    // Ruhezeit-Anker fuer den Folgetag: letztes bekanntes Schichtende; bei
    // unaufgeloesten Schichten die Untergrenze (Verstoss bleibt sicher,
    // Einhaltung wird "nicht pruefbar").
    const last = dayShifts.at(-1);
    if (last) {
      if (last.endAt) {
        previousShiftEnd = last.endAt;
        previousEndIsLowerBound = false;
      } else if (shiftResolution(last, now, graceMs) === 'unresolved') {
        previousShiftEnd = last.workedAtLeastUntil ?? shiftLastEventAt(last);
        previousEndIsLowerBound = true;
      }
      // Laufende Schicht: Anker unveraendert lassen (kein Ende bekannt).
    }
  }
  return days;
}
