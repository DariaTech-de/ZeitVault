import { describe, expect, it } from 'vitest';
import { foldShifts, selectShiftsForAccountingDay, shiftAccountingDay, shiftState } from './shifts';
import type { StampEvent } from './types';

const d = (iso: string): Date => new Date(iso);
const ev = (kind: StampEvent['kind'], iso: string, id?: string): StampEvent => ({
  id,
  kind,
  at: d(iso),
});

// K-02/K-03-Basis: Schichten sind die Faltungseinheit - NICHT der Kalendertag.
// Eine Nachtschicht ueber Mitternacht ist EINE Schicht und muss ohne Fehler
// faltbar sein (bisher warf die tagesweise Faltung StampTransitionError).
describe('foldShifts', () => {
  it('Nachtschicht ueber Mitternacht ist EINE Schicht', () => {
    const shifts = foldShifts([
      ev('clock_in', '2026-01-31T21:00:00Z'), // lokal 22:00 Berlin
      ev('break_start', '2026-01-31T23:30:00Z'),
      ev('break_end', '2026-02-01T00:00:00Z'),
      ev('clock_out', '2026-02-01T05:00:00Z'), // lokal 06:00 Berlin
    ]);
    expect(shifts).toHaveLength(1);
    const s = shifts[0]!;
    expect(s.startAt.toISOString()).toBe('2026-01-31T21:00:00.000Z');
    expect(s.endAt?.toISOString()).toBe('2026-02-01T05:00:00.000Z');
    expect(s.workIntervals).toHaveLength(2);
    expect(s.breakIntervals).toHaveLength(1);
  });

  it('mehrere Schichten werden getrennt; offene Schicht am Ende erkannt', () => {
    const shifts = foldShifts([
      ev('clock_in', '2026-07-06T06:00:00Z'),
      ev('clock_out', '2026-07-06T14:00:00Z'),
      ev('clock_in', '2026-07-07T06:00:00Z'),
    ]);
    expect(shifts).toHaveLength(2);
    expect(shifts[0]?.endAt).not.toBeNull();
    expect(shifts[1]?.endAt).toBeNull();
    expect(shiftState(shifts)).toBe('in');
  });

  it('DST-Fruehjahr: Schicht lokal 22:00-06:00 hat 7 h Arbeitszeit (K-01)', () => {
    const shifts = foldShifts([
      ev('clock_in', '2026-03-28T21:00:00Z'), // 22:00 lokal (CET)
      ev('clock_out', '2026-03-29T04:00:00Z'), // 06:00 lokal (CEST)
    ]);
    const minutes = shifts[0]!.workIntervals.reduce(
      (sum, iv) => sum + (iv.end.getTime() - iv.start.getTime()) / 60000,
      0,
    );
    expect(minutes).toBe(7 * 60);
  });

  it('DST-Herbst: Schicht lokal 22:00-06:00 hat 9 h Arbeitszeit (K-01)', () => {
    const shifts = foldShifts([
      ev('clock_in', '2026-10-24T20:00:00Z'), // 22:00 lokal (CEST)
      ev('clock_out', '2026-10-25T05:00:00Z'), // 06:00 lokal (CET)
    ]);
    const minutes = shifts[0]!.workIntervals.reduce(
      (sum, iv) => sum + (iv.end.getTime() - iv.start.getTime()) / 60000,
      0,
    );
    expect(minutes).toBe(9 * 60);
  });

  it('unzulaessige Uebergaenge werfen weiterhin (doppeltes Einstempeln, verwaistes Ausstempeln)', () => {
    expect(() =>
      foldShifts([ev('clock_in', '2026-07-06T06:00:00Z'), ev('clock_in', '2026-07-06T08:00:00Z')]),
    ).toThrow(/eingestempelt/i);
    expect(() => foldShifts([ev('clock_out', '2026-07-06T14:00:00Z')])).toThrow();
  });

  // Vergessenes Ausstempeln: Ein clock_in nach mehr als 12 h Inaktivitaet
  // schliesst die haengende Schicht IMPLIZIT an ihrem letzten Ereignis (das
  // offene Segment wird NICHT als Arbeitszeit gezaehlt; Korrektur erfolgt ueber
  // den Anpassungsantrag). Reine Projektionsentscheidung - es wird KEIN
  // synthetisches Ereignis geschrieben (ADR-0017, GoBD).
  it('clock_in nach > 12 h Inaktivitaet schliesst die haengende Schicht implizit', () => {
    const shifts = foldShifts([
      ev('clock_in', '2026-07-06T06:00:00Z'),
      // vergessenes clock_out; letztes Ereignis 06:00 -> naechster Tag 08:00 = 26 h
      ev('clock_in', '2026-07-07T08:00:00Z'),
      ev('clock_out', '2026-07-07T16:00:00Z'),
    ]);
    expect(shifts).toHaveLength(2);
    expect(shifts[0]?.endedImplicitly).toBe(true);
    expect(shifts[0]?.endAt?.toISOString()).toBe('2026-07-06T06:00:00.000Z');
    expect(shifts[0]?.workIntervals).toHaveLength(0); // haengendes Segment zaehlt nicht
    expect(shifts[1]?.endedImplicitly).toBeUndefined();
    expect(shifts[1]?.endAt?.toISOString()).toBe('2026-07-07T16:00:00.000Z');
  });

  it('clock_out nach langem Abstand bleibt gueltig (lange Schicht, kein Implicit-Close)', () => {
    // 10-h-Nachtschicht ohne Pausenstempel: Abstand < 12 h, regulaer gueltig.
    const shifts = foldShifts([
      ev('clock_in', '2026-07-06T18:00:00Z'),
      ev('clock_out', '2026-07-07T04:00:00Z'),
    ]);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]?.endedImplicitly).toBeUndefined();
  });

  it('doppeltes Einstempeln mit kurzem Abstand wirft weiterhin (kein Implicit-Close)', () => {
    expect(() =>
      foldShifts([ev('clock_in', '2026-07-06T06:00:00Z'), ev('clock_in', '2026-07-06T11:00:00Z')]),
    ).toThrow(/eingestempelt/i);
  });

  it('Korrekturen (correctsId) werden vor der Faltung aufgeloest', () => {
    const shifts = foldShifts([
      ev('clock_in', '2026-07-06T06:30:00Z', 'a'),
      { id: 'b', kind: 'clock_in', at: d('2026-07-06T06:00:00Z'), correctsId: 'a' },
      ev('clock_out', '2026-07-06T14:00:00Z', 'c'),
    ]);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]?.startAt.toISOString()).toBe('2026-07-06T06:00:00.000Z');
  });
});

// ADR-0018: Abrechnungstag = lokaler Kalendertag des Schichtbeginns.
describe('shiftAccountingDay / selectShiftsForAccountingDay', () => {
  const shifts = foldShifts([
    ev('clock_in', '2026-01-31T21:00:00Z'), // Beginn lokal 31.01. 22:00
    ev('clock_out', '2026-02-01T05:00:00Z'),
    ev('clock_in', '2026-02-01T21:00:00Z'), // Beginn lokal 01.02. 22:00
    ev('clock_out', '2026-02-02T05:00:00Z'),
  ]);

  it('Nachtschicht gehoert zum Tag des Schichtbeginns (K-02)', () => {
    expect(shiftAccountingDay(shifts[0]!, 'Europe/Berlin')).toBe('2026-01-31');
    expect(shiftAccountingDay(shifts[1]!, 'Europe/Berlin')).toBe('2026-02-01');
  });

  it('Auswahl je Abrechnungstag', () => {
    expect(selectShiftsForAccountingDay(shifts, '2026-01-31', 'Europe/Berlin')).toHaveLength(1);
    expect(selectShiftsForAccountingDay(shifts, '2026-02-01', 'Europe/Berlin')).toHaveLength(1);
    expect(selectShiftsForAccountingDay(shifts, '2026-02-02', 'Europe/Berlin')).toHaveLength(0);
  });

  it('UTC-Grenzfall: Beginn 23:30 UTC = lokal schon der Folgetag', () => {
    const s = foldShifts([
      ev('clock_in', '2026-03-28T23:30:00Z'), // lokal 29.03. 00:30
      ev('clock_out', '2026-03-29T06:00:00Z'),
    ]);
    expect(shiftAccountingDay(s[0]!, 'Europe/Berlin')).toBe('2026-03-29');
  });
});
