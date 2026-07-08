import { describe, expect, it } from 'vitest';
import { ARBZG_2026_V1 } from '../arbzg/rule-packages';
import { buildAccountingDays } from './day-view';
import type { StampEvent } from './types';

const d = (iso: string): Date => new Date(iso);
const ev = (kind: StampEvent['kind'], iso: string): StampEvent => ({ kind, at: d(iso) });

// Gemeinsame Tagessicht (ADR-0018): Schichten werden dem lokalen Kalendertag
// ihres Beginns zugerechnet; die Ruhezeit verkettet ueber Tage; offene
// Schichten werden zu "jetzt" materialisiert.
describe('buildAccountingDays', () => {
  it('Nachtschicht zaehlt vollstaendig zum Tag des Schichtbeginns (K-02/K-03)', () => {
    const days = buildAccountingDays(
      [
        ev('clock_in', '2026-01-31T21:00:00Z'), // lokal 31.01. 22:00
        ev('clock_out', '2026-02-01T05:00:00Z'), // lokal 01.02. 06:00
      ],
      'Europe/Berlin',
      ARBZG_2026_V1,
      d('2026-02-02T12:00:00Z'),
    );
    expect(days).toHaveLength(1);
    expect(days[0]?.date).toBe('2026-01-31');
    expect(days[0]?.workedMinutes).toBe(8 * 60);
  });

  it('Ruhezeit wird schichtuebergreifend ueber die Kalendertagsgrenze geprueft (B-03/K-03)', () => {
    // Schicht 1 endet 01.02. 06:00 lokal; Schicht 2 beginnt 01.02. 14:00 lokal
    // -> nur 8 h Ruhezeit -> Verstoss am zweiten Tag.
    const days = buildAccountingDays(
      [
        ev('clock_in', '2026-01-31T21:00:00Z'),
        ev('clock_out', '2026-02-01T05:00:00Z'),
        ev('clock_in', '2026-02-01T13:00:00Z'), // lokal 14:00
        ev('clock_out', '2026-02-01T17:00:00Z'),
      ],
      'Europe/Berlin',
      ARBZG_2026_V1,
      d('2026-02-02T12:00:00Z'),
    );
    expect(days).toHaveLength(2);
    const codes = days[1]?.findings.map((f) => f.code);
    expect(codes).toContain('REST_PERIOD_TOO_SHORT');
  });

  it('offene Schicht wird zu "jetzt" materialisiert', () => {
    const days = buildAccountingDays(
      [ev('clock_in', '2026-07-06T06:00:00Z')],
      'Europe/Berlin',
      ARBZG_2026_V1,
      d('2026-07-06T10:00:00Z'),
    );
    expect(days[0]?.workedMinutes).toBe(240);
    expect(days[0]?.shifts[0]?.endAt).toBeNull();
  });

  it('DST-Fruehjahrsschicht ergibt 7 h am Tag des Schichtbeginns (K-01)', () => {
    const days = buildAccountingDays(
      [ev('clock_in', '2026-03-28T21:00:00Z'), ev('clock_out', '2026-03-29T04:00:00Z')],
      'Europe/Berlin',
      ARBZG_2026_V1,
      d('2026-03-30T12:00:00Z'),
    );
    expect(days[0]?.date).toBe('2026-03-28');
    expect(days[0]?.workedMinutes).toBe(7 * 60);
  });

  it('zwei Schichten am selben Abrechnungstag werden zusammen bewertet', () => {
    const days = buildAccountingDays(
      [
        ev('clock_in', '2026-07-06T04:00:00Z'), // 06:00 lokal
        ev('clock_out', '2026-07-06T08:00:00Z'), // 10:00 lokal (4 h)
        ev('clock_in', '2026-07-06T09:00:00Z'), // 11:00 lokal (>= 15 min Luecke)
        ev('clock_out', '2026-07-06T12:00:00Z'), // 14:00 lokal (3 h)
      ],
      'Europe/Berlin',
      ARBZG_2026_V1,
      d('2026-07-07T12:00:00Z'),
    );
    expect(days).toHaveLength(1);
    expect(days[0]?.workedMinutes).toBe(7 * 60);
  });
});
