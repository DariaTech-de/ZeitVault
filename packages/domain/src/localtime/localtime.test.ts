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

describe('assertValidTimeZone', () => {
  it('akzeptiert gueltige IANA-Zonen und wirft bei ungueltigen', () => {
    expect(() => assertValidTimeZone('Europe/Berlin')).not.toThrow();
    expect(() => assertValidTimeZone('Foo/Bar')).toThrow(/Zeitzone/);
  });
});
