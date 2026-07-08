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
  /** null = kein clock_out bekannt (Schicht laeuft ODER ist unaufgeloest). */
  endAt: Date | null;
  workIntervals: WorkInterval[];
  breakIntervals: BreakInterval[];
  /** Offenes Segment (nur bei endAt === null und nicht unresolved). */
  open: { kind: 'work' | 'break'; since: Date } | null;
  /** Wirksame Ereignisse dieser Schicht (chronologisch). */
  events: StampEvent[];
  /**
   * Ende unbekannt (ADR-0019): Ein nachfolgendes clock_in traf auf diese
   * offene Schicht. `endAt` bleibt NULL (keine Behauptung), das haengende
   * Segment ist NICHT materialisierbar; `workedAtLeastUntil` ist die
   * Untergrenze. Aufloesung ausschliesslich durch Menschen (Anpassungsantrag
   * oder FK-Ersatzweg), niemals automatisch.
   */
  unresolved?: true;
  /**
   * Zeitpunkt des letzten bekannten Ereignisses: AUSDRUECKLICH eine
   * Untergrenze der Anwesenheit, nie ein Ende (UI: "mindestens bis").
   */
  workedAtLeastUntil?: Date;
}

/** Aufloesungszustand einer Schicht (ADR-0019). */
export type ShiftResolution = 'open' | 'unresolved' | 'closed' | 'closed_by_correction';

/**
 * Kulanzfrist: Solange das letzte Ereignis einer nicht beendeten Schicht
 * juenger ist, gilt sie als 'open' (laeuft); danach als 'unresolved'.
 * 16 h decken die laengste plausible Schicht (Bereitschaft nach Paragraf 7
 * Abs. 2a ArbZG stempelt zwischendurch) ohne Fehlklassifikation ab.
 *
 * System-GRUNDWERT (identisch zu ARBZG_2026_V1.params.openShiftGraceMinutes):
 * Der wirksame Wert kommt aus der Regelschicht (B-08/B-09,
 * `resolveEffectiveParams`) - Abweichungen sind mitbestimmungspflichtig und
 * erfordern eine TV-/BV-Referenz; die Helfer nehmen ihn als `graceMs` an.
 */
export const OPEN_SHIFT_GRACE_MS = 16 * 60 * 60 * 1000;

/**
 * Faltet Rohereignisse (inkl. Korrektur-Aufloesung ueber correctsId) zu
 * Schichten. Wirft StampTransitionError bei unzulaessigen Statuswechseln -
 * mit einer Ausnahme (ADR-0019): `clock_in` ist IMMER erfolgreich; trifft es
 * auf eine offene Schicht, wird diese `unresolved` (Ende unbekannt), nie
 * implizit geschlossen und nie blockiert.
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
        if (current !== null) {
          // ADR-0019: Die nicht beendete Vorschicht wird 'unresolved' - das
          // Ende bleibt unbekannt (endAt NULL, kein synthetisches Ereignis),
          // das haengende Segment zaehlt nicht als Arbeitszeit.
          current.open = null;
          current.unresolved = true;
          current.workedAtLeastUntil = current.events.at(-1)?.at ?? current.startAt;
          shifts.push(current);
          current = null;
          state = 'out';
          segmentStart = null;
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

/** Zeitpunkt des letzten bekannten Ereignisses einer Schicht. */
export function shiftLastEventAt(shift: Shift): Date {
  return shift.events.at(-1)?.at ?? shift.startAt;
}

/**
 * Aufloesungszustand einer Schicht zum Zeitpunkt `now` (ADR-0019):
 * - endAt gesetzt: 'closed'; 'closed_by_correction', wenn das beendende
 *   Ereignis ueber den Korrekturweg entstand.
 * - endAt NULL: 'unresolved', wenn ein nachfolgendes clock_in es festgestellt
 *   hat ODER die Kulanzfrist seit dem letzten Ereignis abgelaufen ist;
 *   sonst 'open' (laeuft).
 */
export function shiftResolution(
  shift: Shift,
  now: Date,
  graceMs: number = OPEN_SHIFT_GRACE_MS,
): ShiftResolution {
  if (shift.endAt !== null) {
    const terminating = shift.events.at(-1);
    return terminating?.correctsId || terminating?.viaCorrection
      ? 'closed_by_correction'
      : 'closed';
  }
  if (shift.unresolved) return 'unresolved';
  return now.getTime() - shiftLastEventAt(shift).getTime() > graceMs ? 'unresolved' : 'open';
}

/** Aktueller Anwesenheitsstatus aus der Schichtliste (Kulanzfrist beachtet). */
export function shiftState(
  shifts: readonly Shift[],
  now: Date,
  graceMs: number = OPEN_SHIFT_GRACE_MS,
): StampState {
  const last = shifts.at(-1);
  if (!last || last.endAt !== null) return 'out';
  if (shiftResolution(last, now, graceMs) !== 'open') return 'out';
  return last.open?.kind === 'break' ? 'break' : 'in';
}

/**
 * Schliesst das offene Segment einer LAUFENDEN Schicht zum Zeitpunkt `now`
 * ("Stand jetzt"); liegt `now` vor dem Segmentbeginn, wird auf den Beginn
 * geklemmt. Unaufgeloeste Schichten (ADR-0019) werden NICHT materialisiert:
 * ihr haengendes Segment ist keine Arbeitszeit, die Intervalle sind die
 * Untergrenze.
 */
export function materializeShift(
  shift: Shift,
  now: Date,
  graceMs: number = OPEN_SHIFT_GRACE_MS,
): { workIntervals: WorkInterval[]; breakIntervals: BreakInterval[] } {
  const workIntervals = [...shift.workIntervals];
  const breakIntervals = [...shift.breakIntervals];
  if (shift.endAt === null && shift.open && shiftResolution(shift, now, graceMs) === 'open') {
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
