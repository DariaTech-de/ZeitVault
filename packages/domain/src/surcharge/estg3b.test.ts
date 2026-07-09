import { describe, expect, it } from 'vitest';
import { classifySurchargeMinutes } from './estg3b';

// § 3b EStG-Klassifikation an ECHTEN Instants (C-01..C-05, C-07, K-04).
// Saetze/Fenster sind die gesetzlichen Werte aus der Spezifikation (Rechtsstand
// Juli 2026) - nie konfigurierbar (ADR-0018: gesetzliche Splittung).
const d = (iso: string): Date => new Date(iso);
const tz = 'Europe/Berlin';
const noHoliday = () => false;

function classify(
  startIso: string,
  endIso: string,
  isHoliday: (date: string) => boolean = noHoliday,
  shiftStartIso: string = startIso,
) {
  return classifySurchargeMinutes(
    [{ start: d(startIso), end: d(endIso) }],
    d(shiftStartIso),
    tz,
    isHoliday,
  );
}

describe('C-01: Nachtarbeit 20:00-06:00, 25 %, minutengenau an der 20:00-Grenze', () => {
  it('Schicht 18:00-22:00 lokal: exakt 120 min Nacht', () => {
    // Mo 06.07.2026, CEST: 18:00 lokal = 16:00Z.
    const r = classify('2026-07-06T16:00:00Z', '2026-07-06T20:00:00Z');
    expect(r.night25Minutes).toBe(120);
    expect(r.night40Minutes).toBe(0);
  });
});

describe('C-02: 00:00-04:00 = 40 %, nur bei Arbeitsaufnahme VOR 00:00', () => {
  it('Schicht 22:00-06:00: 40 % fuer 0-4 Uhr, 25 % fuer den Rest der Nacht', () => {
    // Di 07.07. 22:00 lokal = 20:00Z bis Mi 08.07. 06:00 lokal = 04:00Z.
    const r = classify('2026-07-07T20:00:00Z', '2026-07-08T04:00:00Z');
    expect(r.night40Minutes).toBe(240); // 00:00-04:00
    expect(r.night25Minutes).toBe(240); // 22:00-00:00 + 04:00-06:00
  });

  it('Schicht 01:00-06:00: nur 25 % (Aufnahme nach Mitternacht)', () => {
    const r = classify('2026-07-07T23:00:00Z', '2026-07-08T04:00:00Z'); // 01:00-06:00 lokal
    expect(r.night40Minutes).toBe(0);
    expect(r.night25Minutes).toBe(300);
  });
});

describe('C-03/C-03a: Sonntag 50 %, Fortwirkung 0-4 Uhr des Folgetags', () => {
  it('AK: Schicht So 22:00 - Mo 06:00 -> 50 % bis Mo 04:00, danach nicht mehr', () => {
    // So 05.07.2026 22:00 lokal = 20:00Z bis Mo 06.07. 06:00 lokal = 04:00Z.
    const r = classify('2026-07-05T20:00:00Z', '2026-07-06T04:00:00Z');
    expect(r.sunday50Minutes).toBe(120 + 240); // So 22-24 + Mo 0-4 (Fortwirkung)
  });

  it('AK: Schicht Mo 01:00-06:00 -> kein Sonntagszuschlag', () => {
    const r = classify('2026-07-05T23:00:00Z', '2026-07-06T04:00:00Z', noHoliday, '2026-07-05T23:00:00Z');
    // Mo 06.07. 01:00-06:00 lokal, Aufnahme Mo 01:00 (nach 0 Uhr).
    expect(r.sunday50Minutes).toBe(0);
  });
});

describe('C-04/C-04a: Feiertag 125 %, 31.12. ab 14:00, Fortwirkung 0-4', () => {
  it('AK: Schicht Feiertag 22:00 - Folgetag 06:00 -> 125 % bis 04:00, danach nicht mehr', () => {
    // Fronleichnam-artiger Feiertag am Do 04.06.2026 (per Stub).
    const isHoliday = (date: string) => date === '2026-06-04';
    const r = classify('2026-06-04T20:00:00Z', '2026-06-05T04:00:00Z', isHoliday);
    expect(r.holiday125Minutes).toBe(120 + 240); // 22-24 + 0-4 Fortwirkung
  });

  it('31.12. ab 14:00 Uhr: 125 % (vorher nicht)', () => {
    // Do 31.12.2026, CET: 12:00-16:00 lokal = 11:00Z-15:00Z.
    const r = classify('2026-12-31T11:00:00Z', '2026-12-31T15:00:00Z');
    expect(r.holiday125Minutes).toBe(120); // nur 14:00-16:00
  });
});

describe('C-05: 24.12. ab 14:00, 25./26.12., 01.05.: 150 %', () => {
  it('24.12.: vor 14:00 kein Sondersatz, ab 14:00 150 %', () => {
    // Do 24.12.2026 12:00-16:00 lokal (CET) = 11:00Z-15:00Z.
    const r = classify('2026-12-24T11:00:00Z', '2026-12-24T15:00:00Z');
    expect(r.special150Minutes).toBe(120);
  });

  it('25.12. ist ganztaegig 150 % - auch wenn er gesetzlicher Feiertag ist (Konkurrenz: hoechster Satz)', () => {
    const isHoliday = (date: string) => date === '2026-12-25';
    // Fr 25.12.2026 10:00-14:00 lokal = 09:00Z-13:00Z.
    const r = classify('2026-12-25T09:00:00Z', '2026-12-25T13:00:00Z', isHoliday);
    expect(r.special150Minutes).toBe(240);
    expect(r.holiday125Minutes).toBe(0);
  });

  it('01.05. ist 150 %', () => {
    // Fr 01.05.2026 10:00-12:00 lokal (CEST) = 08:00Z-10:00Z.
    const r = classify('2026-05-01T08:00:00Z', '2026-05-01T10:00:00Z');
    expect(r.special150Minutes).toBe(120);
  });
});

describe('C-07: Kumulationsregeln (dokumentiert, testabgedeckt)', () => {
  it('Nachtarbeit am Feiertag: Nacht- und Feiertagszuschlag KUMULIEREN', () => {
    const isHoliday = (date: string) => date === '2026-06-04';
    // Feiertag 20:00-23:00 lokal = 18:00Z-21:00Z.
    const r = classify('2026-06-04T18:00:00Z', '2026-06-04T21:00:00Z', isHoliday);
    expect(r.night25Minutes).toBe(180);
    expect(r.holiday125Minutes).toBe(180);
  });

  it('Feiertag auf Sonntag: NUR der Feiertagssatz (Tagesklassen konkurrieren)', () => {
    // So 07.06.2026 als Feiertag (Stub): 10:00-12:00 lokal.
    const isHoliday = (date: string) => date === '2026-06-07';
    const r = classify('2026-06-07T08:00:00Z', '2026-06-07T10:00:00Z', isHoliday);
    expect(r.holiday125Minutes).toBe(120);
    expect(r.sunday50Minutes).toBe(0);
  });

  it('night40 ersetzt night25 im 0-4-Fenster (nie beide)', () => {
    const r = classify('2026-07-07T20:00:00Z', '2026-07-08T04:00:00Z');
    expect(r.night40Minutes + r.night25Minutes).toBe(480); // Partition der Nacht
  });
});

describe('K-04: minutengenau ueber Mitternacht und DST, an echten Instants', () => {
  it('DST-Fruehjahrsnacht 22:00-06:00 lokal: 7 reale Stunden, alle in der Nacht', () => {
    // Sa 28.03.2026 22:00 CET = 21:00Z bis So 29.03. 06:00 CEST = 04:00Z.
    const r = classify('2026-03-28T21:00:00Z', '2026-03-29T04:00:00Z');
    expect(r.night25Minutes + r.night40Minutes).toBe(7 * 60);
    // 0-4 Uhr lokal existiert real nur 3 h (02-03 fehlt), Aufnahme vor 0 Uhr.
    expect(r.night40Minutes).toBe(180);
    // Der So beginnt an der echten Mitternacht: Sonntagsminuten = reale 0-6 = 5 h.
    expect(r.sunday50Minutes).toBe(300);
  });

  it('Summeninvariante: jede Minute hat genau eine Nacht- und eine Tagesklasse', () => {
    const r = classify('2026-07-05T20:00:00Z', '2026-07-06T04:00:00Z'); // So 22 - Mo 6
    const total = 8 * 60;
    expect(r.night25Minutes + r.night40Minutes + r.nightNoneMinutes).toBe(total);
    expect(
      r.sunday50Minutes + r.holiday125Minutes + r.special150Minutes + r.dayNoneMinutes,
    ).toBe(total);
  });
});
