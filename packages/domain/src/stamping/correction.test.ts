import { describe, expect, it } from 'vitest';
import { computeStampStatus } from './evaluate';
import { resolveEffectiveEvents } from './fold';
import type { StampEvent } from './types';

const d = (iso: string): Date => new Date(iso);

describe('resolveEffectiveEvents', () => {
  it('ersetzt ein korrigiertes Ereignis durch die Korrektur', () => {
    const events: StampEvent[] = [
      { id: 'e1', kind: 'clock_in', at: d('2026-06-26T08:05:00Z') },
      { id: 'e2', kind: 'clock_in', at: d('2026-06-26T08:00:00Z'), correctsId: 'e1' },
    ];
    const effective = resolveEffectiveEvents(events);
    expect(effective.map((e) => e.id)).toEqual(['e2']);
  });

  it('laesst unkorrigierte Ereignisse unveraendert', () => {
    const events: StampEvent[] = [{ id: 'e1', kind: 'clock_in', at: d('2026-06-26T08:00:00Z') }];
    expect(resolveEffectiveEvents(events)).toHaveLength(1);
  });
});

describe('Korrektur wirkt auf die Auswertung', () => {
  it('korrigierte Anfangszeit aendert die gearbeitete Zeit', () => {
    const events: StampEvent[] = [
      { id: 'e1', kind: 'clock_in', at: d('2026-06-26T08:30:00Z') },
      // Korrektur: tatsaechlich um 08:00 eingestempelt
      { id: 'e2', kind: 'clock_in', at: d('2026-06-26T08:00:00Z'), correctsId: 'e1' },
      { id: 'e3', kind: 'clock_out', at: d('2026-06-26T16:00:00Z') },
    ];
    const status = computeStampStatus(events, d('2026-06-26T16:00:00Z'));
    expect(status.state).toBe('out');
    // 08:00 -> 16:00 = 8 h, nicht 7,5 h
    expect(status.workedMinutes).toBe(8 * 60);
  });
});
