import { describe, expect, it } from 'vitest';
import { ARBZG_2026_V1 } from '../arbzg/rule-packages';
import { computeStampStatus, evaluateStampDay } from './evaluate';
import { StampTransitionError, foldStampDay } from './fold';
import type { StampEvent } from './types';

const d = (iso: string): Date => new Date(iso);

const day = (...kinds: [StampEvent['kind'], string][]): StampEvent[] =>
  kinds.map(([kind, iso]) => ({ kind, at: d(iso) }));

describe('foldStampDay', () => {
  it('bildet Arbeits- und Pausenintervalle aus einem vollstaendigen Tag', () => {
    const fold = foldStampDay(
      day(
        ['clock_in', '2026-06-26T08:00:00Z'],
        ['break_start', '2026-06-26T12:00:00Z'],
        ['break_end', '2026-06-26T12:30:00Z'],
        ['clock_out', '2026-06-26T16:30:00Z'],
      ),
    );
    expect(fold.state).toBe('out');
    expect(fold.open).toBeNull();
    expect(fold.workIntervals).toHaveLength(2);
    expect(fold.breakIntervals).toHaveLength(1);
  });

  it('sortiert unsortierte Ereignisse vor der Auswertung', () => {
    const fold = foldStampDay(
      day(
        ['clock_out', '2026-06-26T16:00:00Z'],
        ['clock_in', '2026-06-26T08:00:00Z'],
      ),
    );
    expect(fold.state).toBe('out');
    expect(fold.workIntervals).toHaveLength(1);
  });

  it('meldet ein offenes Arbeitssegment bei laufendem Einsatz', () => {
    const fold = foldStampDay(day(['clock_in', '2026-06-26T08:00:00Z']));
    expect(fold.state).toBe('in');
    expect(fold.open).toEqual({ kind: 'work', since: d('2026-06-26T08:00:00Z') });
  });

  it('verbietet doppeltes Einstempeln', () => {
    expect(() =>
      foldStampDay(
        day(['clock_in', '2026-06-26T08:00:00Z'], ['clock_in', '2026-06-26T09:00:00Z']),
      ),
    ).toThrow(StampTransitionError);
  });

  it('verbietet Pausenbeginn ohne Einstempeln', () => {
    expect(() => foldStampDay(day(['break_start', '2026-06-26T08:00:00Z']))).toThrow(
      StampTransitionError,
    );
  });
});

describe('computeStampStatus', () => {
  it('rechnet das offene Segment bis "jetzt" mit', () => {
    const status = computeStampStatus(
      day(['clock_in', '2026-06-26T08:00:00Z']),
      d('2026-06-26T10:00:00Z'),
    );
    expect(status.state).toBe('in');
    expect(status.workedMinutes).toBe(120);
    expect(status.breakMinutes).toBe(0);
  });

  it('zaehlt Pausen nicht zur Arbeitszeit', () => {
    const status = computeStampStatus(
      day(
        ['clock_in', '2026-06-26T08:00:00Z'],
        ['break_start', '2026-06-26T12:00:00Z'],
        ['break_end', '2026-06-26T12:30:00Z'],
        ['clock_out', '2026-06-26T16:30:00Z'],
      ),
      d('2026-06-26T17:00:00Z'),
    );
    expect(status.state).toBe('out');
    expect(status.workedMinutes).toBe(8 * 60);
    expect(status.breakMinutes).toBe(30);
  });
});

describe('evaluateStampDay (Live-ArbZG-Pruefung)', () => {
  it('warnt bei fehlender Pflichtpause nach mehr als 6 h', () => {
    const codes = evaluateStampDay(
      day(['clock_in', '2026-06-26T08:00:00Z']),
      ARBZG_2026_V1,
      d('2026-06-26T15:00:00Z'), // 7 h ohne Pause
      { date: '2026-06-26' },
    ).map((f) => f.code);
    expect(codes).toContain('BREAK_MISSING');
  });

  it('konformer Tag erzeugt keine Befunde', () => {
    const findings = evaluateStampDay(
      day(
        ['clock_in', '2026-06-26T08:00:00Z'],
        ['break_start', '2026-06-26T12:00:00Z'],
        ['break_end', '2026-06-26T12:30:00Z'],
        ['clock_out', '2026-06-26T16:00:00Z'],
      ),
      ARBZG_2026_V1,
      d('2026-06-26T16:00:00Z'),
      { date: '2026-06-26' },
    );
    expect(findings).toHaveLength(0);
  });
});
