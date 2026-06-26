import type { BreakInterval, WorkInterval } from '../arbzg/types';

/** Art einer Stempelung (Rohereignis der Zeiterfassung). */
export type StampKind = 'clock_in' | 'break_start' | 'break_end' | 'clock_out';

/** Eine einzelne, unveraenderliche Stempelung. */
export interface StampEvent {
  kind: StampKind;
  at: Date;
}

/** Erfassungsstatus eines Mitarbeitenden im Tagesverlauf. */
export type StampState = 'out' | 'in' | 'break';

/** Noch offenes (laufendes) Segment - Arbeit oder Pause. */
export interface OpenSegment {
  kind: 'work' | 'break';
  since: Date;
}

/** Ergebnis des Faltens einer Ereignisfolge zu Intervallen + Status. */
export interface StampFold {
  workIntervals: WorkInterval[];
  breakIntervals: BreakInterval[];
  state: StampState;
  open: OpenSegment | null;
}
