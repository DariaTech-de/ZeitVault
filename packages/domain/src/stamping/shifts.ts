import type { BreakInterval, WorkInterval } from '../arbzg/types';
import { localDateOf } from '../localtime/localtime';
import { StampTransitionError, resolveEffectiveEvents } from './fold';
import type { StampEvent, StampState } from './types';

/**
 * Schicht-basierte Faltung (ADR-0017/0018, K-02/K-03): Die Faltungseinheit ist
 * die SCHICHT (clock_in .. clock_out), nicht der Kalendertag. Schichten duerfen
 * Mitternacht und Monatsgrenzen ueberschreiten; der Abrechnungstag ist der
 * lokale Kalendertag des Schichtbeginns (ADR-0018).
 */
export interface Shift {
  startAt: Date;
  /** null = Schicht ist noch offen. */
  endAt: Date | null;
  workIntervals: WorkInterval[];
  breakIntervals: BreakInterval[];
  /** Offenes Segment (nur bei endAt === null). */
  open: { kind: 'work' | 'break'; since: Date } | null;
  /** Wirksame Ereignisse dieser Schicht (chronologisch). */
  events: StampEvent[];
  /**
   * Vergessenes Ausstempeln: Die Schicht wurde durch ein spaeteres clock_in
   * (> IMPLICIT_CLOSE_GAP_MS Inaktivitaet) implizit an ihrem letzten Ereignis
   * geschlossen; das haengende Segment zaehlt NICHT als Arbeitszeit. Korrektur
   * erfolgt fachlich ueber den Anpassungsantrag (kein synthetisches Ereignis,
   * ADR-0017/GoBD).
   */
  endedImplicitly?: true;
}

/**
 * Inaktivitaetsgrenze fuer das implizite Schliessen haengender Schichten durch
 * ein neues clock_in. Gross genug fuer lange Schichten ohne Zwischenstempel
 * (10-12 h), klein genug, dass ein Folgetags-clock_in nach vergessenem
 * Ausstempeln nicht dauerhaft blockiert.
 */
export const IMPLICIT_CLOSE_GAP_MS = 12 * 60 * 60 * 1000;

/**
 * Faltet Rohereignisse (inkl. Korrektur-Aufloesung ueber correctsId) zu
 * Schichten. Wirft StampTransitionError bei unzulaessigen Statuswechseln -
 * identische Zustandsmaschine wie die Tagesfaltung, aber ohne Tagesgrenze.
 */
export function foldShifts(events: readonly StampEvent[]): Shift[] {
  const effective = [...resolveEffectiveEvents(events)].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );

  const shifts: Shift[] = [];
  let current: Shift | null = null;
  let state: StampState = 'out';
  let segmentStart: Date | null = null;

  for (const event of effective) {
    switch (event.kind) {
      case 'clock_in':
        if (state !== 'out' || current !== null) {
          const lastAt = current?.events.at(-1)?.at;
          if (
            current !== null &&
            lastAt !== undefined &&
            event.at.getTime() - lastAt.getTime() > IMPLICIT_CLOSE_GAP_MS
          ) {
            // Vergessenes Ausstempeln: haengende Schicht implizit am letzten
            // Ereignis schliessen; das offene Segment zaehlt nicht.
            current.endAt = lastAt;
            current.open = null;
            current.endedImplicitly = true;
            shifts.push(current);
            current = null;
            state = 'out';
            segmentStart = null;
          } else {
            throw new StampTransitionError('Bereits eingestempelt.');
          }
        }
        current = {
          startAt: event.at,
          endAt: null,
          workIntervals: [],
          breakIntervals: [],
          open: null,
          events: [event],
        };
        state = 'in';
        segmentStart = event.at;
        break;
      case 'break_start':
        if (state !== 'in' || current === null) {
          throw new StampTransitionError('Pausenbeginn nur im Status "eingestempelt" möglich.');
        }
        if (segmentStart) current.workIntervals.push({ start: segmentStart, end: event.at });
        current.events.push(event);
        state = 'break';
        segmentStart = event.at;
        break;
      case 'break_end':
        if (state !== 'break' || current === null) {
          throw new StampTransitionError('Pausenende nur während einer Pause möglich.');
        }
        if (segmentStart) current.breakIntervals.push({ start: segmentStart, end: event.at });
        current.events.push(event);
        state = 'in';
        segmentStart = event.at;
        break;
      case 'clock_out':
        if (state !== 'in' || current === null) {
          throw new StampTransitionError('Ausstempeln nur im Status "eingestempelt" möglich.');
        }
        if (segmentStart) current.workIntervals.push({ start: segmentStart, end: event.at });
        current.events.push(event);
        current.endAt = event.at;
        shifts.push(current);
        current = null;
        state = 'out';
        segmentStart = null;
        break;
    }
  }

  if (current !== null) {
    current.open =
      segmentStart !== null
        ? { kind: state === 'break' ? 'break' : 'work', since: segmentStart }
        : null;
    shifts.push(current);
  }
  return shifts;
}

/** Aktueller Anwesenheitsstatus aus der Schichtliste. */
export function shiftState(shifts: readonly Shift[]): StampState {
  const last = shifts.at(-1);
  if (!last || last.endAt !== null) return 'out';
  return last.open?.kind === 'break' ? 'break' : 'in';
}

/**
 * Schliesst das offene Segment einer Schicht zum Zeitpunkt `now` ("Stand
 * jetzt"); liegt `now` vor dem Segmentbeginn, wird auf den Beginn geklemmt.
 */
export function materializeShift(
  shift: Shift,
  now: Date,
): { workIntervals: WorkInterval[]; breakIntervals: BreakInterval[] } {
  const workIntervals = [...shift.workIntervals];
  const breakIntervals = [...shift.breakIntervals];
  if (shift.endAt === null && shift.open) {
    const end = now.getTime() < shift.open.since.getTime() ? shift.open.since : now;
    if (shift.open.kind === 'work') {
      workIntervals.push({ start: shift.open.since, end });
    } else {
      breakIntervals.push({ start: shift.open.since, end });
    }
  }
  return { workIntervals, breakIntervals };
}

/** Abrechnungstag der Schicht: lokaler Kalendertag des Schichtbeginns (ADR-0018). */
export function shiftAccountingDay(shift: Shift, timeZone: string): string {
  return localDateOf(shift.startAt, timeZone);
}

/** Alle Schichten, deren Abrechnungstag der gegebene lokale Kalendertag ist. */
export function selectShiftsForAccountingDay(
  shifts: readonly Shift[],
  isoDate: string,
  timeZone: string,
): Shift[] {
  return shifts.filter((s) => shiftAccountingDay(s, timeZone) === isoDate);
}
