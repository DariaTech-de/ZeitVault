import type { BreakInterval, WorkInterval } from '../arbzg/types';

/** Art einer Stempelung (Rohereignis der Zeiterfassung). */
export type StampKind = 'clock_in' | 'break_start' | 'break_end' | 'clock_out';

/**
 * Bewertungsart einer Schicht (C-09), gesetzt am `clock_in`:
 * - 'full_work': Vollarbeit.
 * - 'on_call_duty': Bereitschaftsdienst - ARBEITSZEIT im Sinne des ArbZG.
 * - 'standby': Rufbereitschaft - RUHEZEIT: zaehlt nicht als Arbeitszeit und
 *   unterbricht die Ruhezeit nicht (tatsaechliche Einsaetze werden als eigene
 *   Schicht gestempelt).
 * - 'travel': Reisezeit - wird wie Vollarbeit behandelt (dokumentierter
 *   Default; abweichende Verguetung ueber das Lohnartenmapping, C-11).
 * Hinweis: Zusammenfassung arbeitsrechtlicher Einordnung, ersetzt keine
 * Rechtsberatung.
 */
export type WorkKind = 'full_work' | 'on_call_duty' | 'standby' | 'travel';

/** Eine einzelne, unveraenderliche Stempelung. */
export interface StampEvent {
  kind: StampKind;
  at: Date;
  /** Bewertungsart (nur am clock_in wirksam; Default 'full_work', C-09). */
  workKind?: WorkKind;
  /** Persistente ID des Ereignisses (optional fuer reine Berechnungen). */
  id?: string;
  /** Verweis auf das ueberschriebene Ereignis, falls dies eine Korrektur ist. */
  correctsId?: string | null;
  /**
   * Ueber den Korrekturweg entstanden (auch Nachtraege ohne correctsId,
   * z. B. genehmigtes fehlendes clock_out) - unterscheidet 'closed' von
   * 'closed_by_correction' (ADR-0019).
   */
  viaCorrection?: boolean;
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
