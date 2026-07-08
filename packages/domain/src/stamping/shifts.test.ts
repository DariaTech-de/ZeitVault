import { describe, expect, it } from 'vitest';
import {
  foldShifts,
  materializeShift,
  selectShiftsForAccountingDay,
  shiftAccountingDay,
  shiftResolution,
  shiftState,
  trimLeadingWindowCut,
} from './shifts';
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
    expect(shiftState(shifts, d('2026-07-07T07:00:00Z'))).toBe('in');
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

  it('verwaiste Uebergaenge werfen weiterhin (clock_out/Pause ohne Einstempeln)', () => {
    expect(() => foldShifts([ev('clock_out', '2026-07-06T14:00:00Z')])).toThrow();
    expect(() => foldShifts([ev('break_start', '2026-07-06T14:00:00Z')])).toThrow();
  });

  it('Fenster-Beschnitt: fuehrende Ereignisse einer angeschnittenen Schicht werden verworfen', () => {
    // Ein Zeitfenster beginnt mitten in einer Schicht: break_start/break_end/
    // clock_out gehoeren zu einer Schicht mit Beginn VOR dem Fenster.
    const windowed = [
      ev('break_start', '2026-07-06T10:00:00Z'),
      ev('break_end', '2026-07-06T10:30:00Z'),
      ev('clock_out', '2026-07-06T15:45:00Z'),
      ev('clock_in', '2026-07-07T04:00:00Z'),
      ev('clock_out', '2026-07-07T12:00:00Z'),
    ];
    const trimmed = trimLeadingWindowCut(windowed);
    expect(trimmed[0]?.kind).toBe('clock_in');
    const shifts = foldShifts(trimmed);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]?.startAt.toISOString()).toBe('2026-07-07T04:00:00.000Z');
    // Ohne Beschnitt bleibt der verwaiste Uebergang ein Fehler (vollstaendige Daten).
    expect(() => foldShifts(windowed)).toThrow();
  });

  // ADR-0019: clock_in ist IMMER erfolgreich. Trifft es auf eine offene
  // Schicht, wird diese 'unresolved' - endAt bleibt NULL (keine Behauptung),
  // workedAtLeastUntil ist die Untergrenze, das haengende Segment zaehlt nicht.
  // Kein synthetisches Ereignis (ADR-0017, GoBD).
  describe('unresolved (ADR-0019)', () => {
    it('PO-Szenario 1: Spaetschicht mit Pause, clock_out vergessen - naechstes clock_in blockiert NICHT', () => {
      const shifts = foldShifts([
        ev('clock_in', '2026-07-06T12:00:00Z'), // Mo 14:00 lokal
        ev('break_start', '2026-07-06T16:00:00Z'), // 18:00 lokal
        ev('break_end', '2026-07-06T16:30:00Z'), // 18:30 lokal
        // clock_out (23:00) vergessen; 11,5 h spaeter (frueher: 409 unter 12 h):
        ev('clock_in', '2026-07-07T04:00:00Z'), // Di 06:00 lokal
      ]);
      expect(shifts).toHaveLength(2);
      const forgotten = shifts[0]!;
      expect(forgotten.unresolved).toBe(true);
      expect(forgotten.endAt).toBeNull(); // keine Behauptung
      expect(forgotten.workedAtLeastUntil?.toISOString()).toBe('2026-07-06T16:30:00.000Z');
      expect(forgotten.workIntervals).toHaveLength(1); // nur das abgeschlossene Intervall
      expect(shifts[1]?.unresolved).toBeUndefined();
      expect(shiftState(shifts, d('2026-07-07T05:00:00Z'))).toBe('in');
    });

    it('unresolved wird nicht materialisiert (Untergrenze, kein geratenes Ende)', () => {
      const shifts = foldShifts([
        ev('clock_in', '2026-07-06T12:00:00Z'),
        ev('clock_in', '2026-07-07T04:00:00Z'),
      ]);
      const m = materializeShift(shifts[0]!, d('2026-07-07T05:00:00Z'));
      expect(m.workIntervals).toHaveLength(0);
      expect(shifts[0]?.workedAtLeastUntil?.toISOString()).toBe('2026-07-06T12:00:00.000Z');
    });

    it('auch doppeltes Einstempeln mit kurzem Abstand blockiert nicht (Mensch loest auf)', () => {
      const shifts = foldShifts([
        ev('clock_in', '2026-07-06T06:00:00Z'),
        ev('clock_in', '2026-07-06T06:00:30Z'),
      ]);
      expect(shifts).toHaveLength(2);
      expect(shifts[0]?.unresolved).toBe(true);
    });

    it('Kulanzfrist: offene Schicht ist erst open, nach Ablauf unresolved', () => {
      const shifts = foldShifts([ev('clock_in', '2026-07-06T06:00:00Z')]);
      const shift = shifts[0]!;
      expect(shiftResolution(shift, d('2026-07-06T14:00:00Z'))).toBe('open');
      expect(materializeShift(shift, d('2026-07-06T14:00:00Z')).workIntervals).toHaveLength(1);
      expect(shiftResolution(shift, d('2026-07-07T06:00:00Z'))).toBe('unresolved');
      expect(materializeShift(shift, d('2026-07-07T06:00:00Z')).workIntervals).toHaveLength(0);
      expect(shiftState(shifts, d('2026-07-07T06:00:00Z'))).toBe('out');
    });

    it('closed vs. closed_by_correction unterscheidet den Korrekturweg', () => {
      const now = d('2026-07-07T00:00:00Z');
      const regular = foldShifts([
        ev('clock_in', '2026-07-06T06:00:00Z'),
        ev('clock_out', '2026-07-06T14:00:00Z'),
      ]);
      expect(shiftResolution(regular[0]!, now)).toBe('closed');
      const corrected = foldShifts([
        ev('clock_in', '2026-07-06T06:00:00Z'),
        { kind: 'clock_out', at: d('2026-07-06T14:00:00Z'), viaCorrection: true },
      ]);
      expect(shiftResolution(corrected[0]!, now)).toBe('closed_by_correction');
    });
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
