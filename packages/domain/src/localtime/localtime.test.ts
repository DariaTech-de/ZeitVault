import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assertValidTimeZone,
  localDateOf,
  localDayStart,
  localMinuteOfDay,
  sliceIntervalByLocalDay,
  tzOffsetMinutes,
} from './localtime';

const d = (iso: string): Date => new Date(iso);

// K-01/K-06: Speicherung in UTC, Bewertung in der lokalen Zeitzone des
// Einsatzortes. Europe/Berlin 2026: Sommerzeitbeginn So 29.03. (02:00 -> 03:00,
// 23-h-Tag), Sommerzeitende So 25.10. (03:00 -> 02:00, 25-h-Tag).
describe('tzOffsetMinutes', () => {
  it('Berlin: +60 im Winter, +120 im Sommer', () => {
    expect(tzOffsetMinutes(d('2026-01-08T10:00:00Z'), 'Europe/Berlin')).toBe(60);
    expect(tzOffsetMinutes(d('2026-07-08T10:00:00Z'), 'Europe/Berlin')).toBe(120);
  });

  it('exakt an der Umstellung: vor 01:00Z +60, ab 01:00Z +120 (29.03.2026)', () => {
    expect(tzOffsetMinutes(d('2026-03-29T00:59:00Z'), 'Europe/Berlin')).toBe(60);
    expect(tzOffsetMinutes(d('2026-03-29T01:00:00Z'), 'Europe/Berlin')).toBe(120);
  });
});

describe('localDateOf', () => {
  it('UTC-Instant faellt auf den lokalen Kalendertag', () => {
    // 23:30 UTC am 28.03. = 00:30 Berlin am 29.03.
    expect(localDateOf(d('2026-03-28T23:30:00Z'), 'Europe/Berlin')).toBe('2026-03-29');
    // 22:30 UTC am 28.03. = 23:30 Berlin am 28.03.
    expect(localDateOf(d('2026-03-28T22:30:00Z'), 'Europe/Berlin')).toBe('2026-03-28');
  });
});

describe('localMinuteOfDay', () => {
  it('liefert Minuten seit lokaler Mitternacht', () => {
    // 21:00 UTC (28.03., CET) = 22:00 lokal
    expect(localMinuteOfDay(d('2026-03-28T21:00:00Z'), 'Europe/Berlin')).toBe(22 * 60);
    // 04:00 UTC (29.03., CEST) = 06:00 lokal
    expect(localMinuteOfDay(d('2026-03-29T04:00:00Z'), 'Europe/Berlin')).toBe(6 * 60);
  });
});

describe('localDayStart', () => {
  it('liefert den UTC-Instant der lokalen Mitternacht', () => {
    // Mitternacht 29.03. Berlin (CET) = 23:00 UTC am 28.03.
    expect(localDayStart('2026-03-29', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-28T23:00:00.000Z',
    );
    // Mitternacht 30.03. Berlin (CEST) = 22:00 UTC am 29.03.
    expect(localDayStart('2026-03-30', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    );
  });
});

// Kalendertaegliche Lesart (K-03 zweite Lesart; Grundlage der
// Zuschlags-Splittung K-04): Intervall wird an lokalen Tagesgrenzen geteilt.
describe('sliceIntervalByLocalDay', () => {
  it('Nachtschicht ueber die DST-Umstellung: 7 h gesamt, korrekt gesplittet (K-01)', () => {
    // lokal Sa 28.03. 22:00 (=21:00Z) bis So 29.03. 06:00 (=04:00Z CEST) = 7 h
    const slices = sliceIntervalByLocalDay(
      { start: d('2026-03-28T21:00:00Z'), end: d('2026-03-29T04:00:00Z') },
      'Europe/Berlin',
    );
    expect(slices).toEqual([
      { date: '2026-03-28', startMinute: 22 * 60, minutes: 120 },
      { date: '2026-03-29', startMinute: 0, minutes: 300 }, // 00:00-06:00 lokal, aber 02:00-03:00 existiert nicht => 5 h
    ]);
    expect(slices.reduce((s, x) => s + x.minutes, 0)).toBe(7 * 60);
  });

  it('Nachtschicht am Sommerzeitende: 9 h gesamt (25-h-Tag, K-01)', () => {
    // lokal Sa 24.10. 22:00 (=20:00Z CEST) bis So 25.10. 06:00 (=05:00Z CET) = 9 h
    const slices = sliceIntervalByLocalDay(
      { start: d('2026-10-24T20:00:00Z'), end: d('2026-10-25T05:00:00Z') },
      'Europe/Berlin',
    );
    expect(slices.reduce((s, x) => s + x.minutes, 0)).toBe(9 * 60);
    expect(slices[0]).toEqual({ date: '2026-10-24', startMinute: 22 * 60, minutes: 120 });
    expect(slices[1]?.date).toBe('2026-10-25');
    expect(slices[1]?.minutes).toBe(7 * 60); // 00:00-06:00 lokal enthaelt die doppelte Stunde 02-03
  });

  it('Intervall ohne Tageswechsel bleibt ein Slice', () => {
    const slices = sliceIntervalByLocalDay(
      { start: d('2026-07-06T06:00:00Z'), end: d('2026-07-06T10:00:00Z') },
      'Europe/Berlin',
    );
    expect(slices).toEqual([{ date: '2026-07-06', startMinute: 8 * 60, minutes: 240 }]);
  });
});

// Summeninvariante (B-12): Die Splittung darf KEINE eigene Rundung beitragen.
// Gerundet wird die Gesamtdauer eines Intervalls genau einmal; die Slice-
// Minuten werden aus gerundeten KUMULIERTEN Grenzen abgeleitet, sodass
// Sum(Slices) == gerundete Gesamtdauer fuer beliebige (sekunden-/millisekunden-
// genaue) Stempel gilt. Je Scheibe einzeln zu runden waere eine systematische
// Rundung ueber Zwischengrenzen (Mitternacht, spaeter Paragraf-3b-Fenster) und
// wuerde mit der Nachtarbeit korrelieren.
describe('sliceIntervalByLocalDay: Summeninvariante bei sekundengenauen Stempeln', () => {
  const totalOf = (startIso: string, endIso: string, tz: string) => {
    const start = d(startIso);
    const end = d(endIso);
    const total = Math.round((end.getTime() - start.getTime()) / 60_000);
    const slices = sliceIntervalByLocalDay({ start, end }, tz);
    return { total, slices, sum: slices.reduce((s, x) => s + x.minutes, 0) };
  };

  it('exakt 480 min ueber Mitternacht (Sekundenanteil) ergibt in Summe 480, nicht 481', () => {
    const { total, sum } = totalOf('2026-01-15T22:00:30Z', '2026-01-16T06:00:30Z', 'Europe/Berlin');
    expect(total).toBe(480);
    expect(sum).toBe(480);
  });

  it('DST-Nacht mit Sekundenanteil: 420 min bleiben 420 (K-01)', () => {
    const { total, sum } = totalOf('2026-03-28T21:00:30Z', '2026-03-29T04:00:30Z', 'Europe/Berlin');
    expect(total).toBe(420);
    expect(sum).toBe(420);
  });

  it('40 s ueber die lokale Mitternacht: die gezaehlte Minute geht nicht verloren', () => {
    // lokal 23:59:40 -> 00:00:20 (Berlin, Winter): Gesamtdauer rundet auf 1 min.
    const { total, sum } = totalOf('2026-01-15T22:59:40Z', '2026-01-15T23:00:20Z', 'Europe/Berlin');
    expect(total).toBe(1);
    expect(sum).toBe(1);
  });

  it('Property: Sum(Slice-Minuten) == gerundete Gesamtdauer, Slices lueckenlos und nicht negativ', () => {
    const zones = ['Europe/Berlin', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland'];
    fc.assert(
      fc.property(
        // Beliebiger Beginn in 2025-2027, Dauer 0..72 h, Millisekunden-genau.
        fc.integer({ min: Date.UTC(2025, 0, 1), max: Date.UTC(2027, 0, 1) }),
        fc.integer({ min: 0, max: 72 * 60 * 60 * 1000 }),
        fc.constantFrom(...zones),
        (startMs, durationMs, tz) => {
          const start = new Date(startMs);
          const end = new Date(startMs + durationMs);
          const slices = sliceIntervalByLocalDay({ start, end }, tz);
          const sum = slices.reduce((s, x) => s + x.minutes, 0);
          expect(sum).toBe(Math.round(durationMs / 60_000));
          for (const s of slices) expect(s.minutes).toBeGreaterThanOrEqual(0);
          // Tagesfolge ist strikt aufsteigend (jede lokale Tagesgrenze genau einmal).
          for (let i = 1; i < slices.length; i += 1) {
            expect(slices[i]!.date > slices[i - 1]!.date).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('assertValidTimeZone', () => {
  it('akzeptiert gueltige IANA-Zonen und wirft bei ungueltigen', () => {
    expect(() => assertValidTimeZone('Europe/Berlin')).not.toThrow();
    expect(() => assertValidTimeZone('Foo/Bar')).toThrow(/Zeitzone/);
  });
});
