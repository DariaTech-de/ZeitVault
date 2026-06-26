import { describe, expect, it } from 'vitest';
import { easterSunday, germanHolidays, isGermanHoliday } from './holidays';
import { selectWorkTimeModel, targetMinutesForDate, type WorkTimeModel } from './worktime';

describe('easterSunday', () => {
  it('berechnet Ostersonntag 2026 (5. April)', () => {
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
  });
  it('berechnet Ostersonntag 2024 (31. März)', () => {
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 });
  });
});

describe('germanHolidays', () => {
  it('NW: bundesweite + Fronleichnam + Allerheiligen, ohne Reformationstag', () => {
    const dates = germanHolidays(2026, 'NW').map((h) => h.date);
    expect(dates).toContain('2026-01-01'); // Neujahr
    expect(dates).toContain('2026-06-04'); // Fronleichnam (Ostern +60)
    expect(dates).toContain('2026-11-01'); // Allerheiligen
    expect(dates).not.toContain('2026-10-31'); // Reformationstag nur in best. Laendern
  });

  it('BE: Internationaler Frauentag, kein Fronleichnam', () => {
    const dates = germanHolidays(2026, 'BE').map((h) => h.date);
    expect(dates).toContain('2026-03-08');
    expect(dates).not.toContain('2026-06-04');
  });

  it('SN: Buß- und Bettag (Mittwoch vor dem 23.11.)', () => {
    const dates = germanHolidays(2026, 'SN').map((h) => h.date);
    expect(dates).toContain('2026-11-18');
    expect(dates).toContain('2026-10-31'); // Reformationstag
  });

  it('isGermanHoliday erkennt Weihnachten, aber nicht den 27.12.', () => {
    expect(isGermanHoliday('2026-12-25', 'NW')).toBe(true);
    expect(isGermanHoliday('2026-12-27', 'NW')).toBe(false);
  });
});

describe('Arbeitszeitmodell (Sollzeit)', () => {
  const model: WorkTimeModel = {
    id: 'm1',
    name: 'Vollzeit Mo-Fr',
    validFrom: '2026-01-01',
    validTo: null,
    targetMinutesByWeekday: [480, 480, 480, 480, 480, 0, 0],
  };

  it('Sollzeit an einem Werktag', () => {
    // 2026-06-30 ist ein Dienstag
    expect(targetMinutesForDate(model, '2026-06-30', false)).toBe(480);
  });
  it('Sollzeit 0 am Wochenende', () => {
    // 2026-06-27 ist ein Samstag
    expect(targetMinutesForDate(model, '2026-06-27', false)).toBe(0);
  });
  it('Sollzeit 0 an einem Feiertag (auch werktags)', () => {
    expect(targetMinutesForDate(model, '2026-06-30', true)).toBe(0);
  });

  it('selectWorkTimeModel waehlt das gueltige Modell', () => {
    const old: WorkTimeModel = { ...model, validTo: '2026-06-30' };
    const next: WorkTimeModel = { ...model, id: 'm2', validFrom: '2026-07-01', validTo: null };
    expect(selectWorkTimeModel([old, next], '2026-06-15')?.id).toBe('m1');
    expect(selectWorkTimeModel([old, next], '2026-08-01')?.id).toBe('m2');
  });
});
