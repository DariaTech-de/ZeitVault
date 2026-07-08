import { describe, expect, it } from 'vitest';
import { ARBZG_2026_V1 } from '../arbzg/rule-packages';
import { localDayStart, sliceIntervalByLocalDay } from '../localtime/localtime';
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

// PRUEFSTEIN (Schnitt-1-Abnahme): Der Abrechnungstag (ADR-0018) ist NUR ein
// Zusatzattribut der Schicht — die Zeitscheiben behalten die echten
// Zeitstempel. Nur so bleiben minutengenaue Zuschlagsfenster ableitbar:
// C-03 (Sonntagsarbeit endet an der echten Mitternacht) und C-03a
// (Fortwirkung des Sonntagszuschlags 0-4 Uhr des Folgetags, Paragraf 3b
// Abs. 3 Nr. 2 EStG, wenn die Arbeit VOR Mitternacht aufgenommen wurde).
describe('Pruefstein: Schicht So 22:00 - Mo 06:00 (Europe/Berlin)', () => {
  const tz = 'Europe/Berlin';
  // So 05.07.2026 22:00 CEST = 20:00Z; Mo 06.07.2026 06:00 CEST = 04:00Z.
  const events = [ev('clock_in', '2026-07-05T20:00:00Z'), ev('clock_out', '2026-07-06T04:00:00Z')];
  const days = buildAccountingDays(events, tz, ARBZG_2026_V1, d('2026-07-07T12:00:00Z'));

  it('Abrechnungstag ist der Sonntag (Zusatzattribut), volle 8 h dort gebucht', () => {
    expect(days).toHaveLength(1);
    expect(days[0]?.date).toBe('2026-07-05');
    expect(days[0]?.workedMinutes).toBe(8 * 60);
  });

  it('workIntervals behalten die ECHTEN Zeitstempel (keine Faltung auf den Abrechnungstag)', () => {
    const iv = days[0]?.shifts[0]?.workIntervals[0];
    expect(iv?.start.getTime()).toBe(d('2026-07-05T20:00:00Z').getTime());
    expect(iv?.end.getTime()).toBe(d('2026-07-06T04:00:00Z').getTime());
  });

  it('C-03: kalendertaegliche Splittung ergibt 2 h Sonntag + 6 h Montag', () => {
    const iv = days[0]!.shifts[0]!.workIntervals[0]!;
    expect(sliceIntervalByLocalDay(iv, tz)).toEqual([
      { date: '2026-07-05', startMinute: 22 * 60, minutes: 120 },
      { date: '2026-07-06', startMinute: 0, minutes: 360 },
    ]);
  });

  it('C-03a: das Fenster Mo 00:00-04:00 und die Aufnahme vor Mitternacht sind aus echten Instants ableitbar', () => {
    const iv = days[0]!.shifts[0]!.workIntervals[0]!;
    const shift = days[0]!.shifts[0]!;
    // Fenstergrenzen als echte Instants (lokale Mitternacht + 4 h; in der
    // Nacht 05./06.07. liegt keine Umstellung).
    const mondayStart = localDayStart('2026-07-06', tz).getTime();
    const windowEnd = mondayStart + 4 * 60 * 60_000;
    const overlapMs =
      Math.min(iv.end.getTime(), windowEnd) - Math.max(iv.start.getTime(), mondayStart);
    expect(overlapMs / 60_000).toBe(240);
    // Voraussetzung der Fortwirkung: Arbeitsaufnahme VOR 0 Uhr des Montags.
    expect(shift.startAt.getTime()).toBeLessThan(mondayStart);
  });
});
