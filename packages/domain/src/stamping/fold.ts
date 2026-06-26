import type { BreakInterval, WorkInterval } from '../arbzg/types';
import type { StampEvent, StampFold } from './types';

/** Ungueltiger Stempel-Statuswechsel (z. B. doppeltes Einstempeln). */
export class StampTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StampTransitionError';
  }
}

/**
 * Faltet eine Folge von Stempelungen (Rohereignisse) zu Arbeits- und
 * Pausenintervallen und ermittelt den Endzustand. Die Ereignisse selbst bleiben
 * unveraendert (append-only); diese Funktion ist rein und damit testbar. Bei
 * unzulaessigen Statuswechseln wird ein StampTransitionError geworfen.
 */
export function foldStampDay(events: readonly StampEvent[]): StampFold {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  const workIntervals: WorkInterval[] = [];
  const breakIntervals: BreakInterval[] = [];
  let state: StampFold['state'] = 'out';
  let segmentStart: Date | null = null;

  for (const event of sorted) {
    switch (event.kind) {
      case 'clock_in':
        if (state !== 'out') {
          throw new StampTransitionError('Bereits eingestempelt.');
        }
        state = 'in';
        segmentStart = event.at;
        break;
      case 'break_start':
        if (state !== 'in') {
          throw new StampTransitionError('Pausenbeginn nur im Status "eingestempelt" moeglich.');
        }
        if (segmentStart) workIntervals.push({ start: segmentStart, end: event.at });
        state = 'break';
        segmentStart = event.at;
        break;
      case 'break_end':
        if (state !== 'break') {
          throw new StampTransitionError('Pausenende nur waehrend einer Pause moeglich.');
        }
        if (segmentStart) breakIntervals.push({ start: segmentStart, end: event.at });
        state = 'in';
        segmentStart = event.at;
        break;
      case 'clock_out':
        if (state !== 'in') {
          throw new StampTransitionError('Ausstempeln nur im Status "eingestempelt" moeglich.');
        }
        if (segmentStart) workIntervals.push({ start: segmentStart, end: event.at });
        state = 'out';
        segmentStart = null;
        break;
    }
  }

  const open: StampFold['open'] =
    segmentStart !== null && state !== 'out'
      ? { kind: state === 'break' ? 'break' : 'work', since: segmentStart }
      : null;

  return { workIntervals, breakIntervals, state, open };
}

/**
 * Schliesst ein ggf. offenes Segment zum Zeitpunkt `now`, damit ein laufender
 * Tag bewertet werden kann ("Stand jetzt").
 */
export function materializeStampDay(
  fold: StampFold,
  now: Date,
): { workIntervals: WorkInterval[]; breakIntervals: BreakInterval[] } {
  const workIntervals: WorkInterval[] = [...fold.workIntervals];
  const breakIntervals: BreakInterval[] = [...fold.breakIntervals];
  if (fold.open) {
    if (fold.open.kind === 'work') {
      workIntervals.push({ start: fold.open.since, end: now });
    } else {
      breakIntervals.push({ start: fold.open.since, end: now });
    }
  }
  return { workIntervals, breakIntervals };
}
