import { describe, expect, it } from 'vitest';
import { evaluateWorkDay } from './engine';
import { ARBZG_2026_V1 } from './rule-packages';
import type { RulePackage } from './types';
import { evaluateWeeklyWorkTime, summarizeWeeks } from './weekly';

// B-11: Taegliche und woechentliche Hoechstarbeitszeit werden PARALLEL
// berechnet; welcher Massstab Befunde erzeugt, schaltet
// maxWorkingTimeMode ('daily' | 'weekly') - je Mitarbeitergruppe ueber
// gruppen-gescopte Regelsaetze (tarifgebunden, siehe Rechtsstand-Abschnitt
// der Spezifikation).
const weeklyPkg: RulePackage = {
  ...ARBZG_2026_V1,
  params: { ...ARBZG_2026_V1.params, maxWorkingTimeMode: 'weekly' },
};
const d = (iso: string): Date => new Date(iso);

describe('summarizeWeeks / evaluateWeeklyWorkTime (B-11)', () => {
  const elevenHourDays = (dates: string[]) => dates.map((date) => ({ date, workedMinutes: 660 }));

  it('Wochensummen werden IMMER berechnet (auch im daily-Modus)', () => {
    const weeks = summarizeWeeks(
      elevenHourDays(['2026-06-01', '2026-06-02', '2026-06-08']),
      () => ARBZG_2026_V1,
    );
    expect(weeks).toHaveLength(2); // KW ab Mo 01.06. und KW ab Mo 08.06.
    expect(weeks[0]).toMatchObject({ weekStart: '2026-06-01', workedMinutes: 1320 });
    expect(weeks[1]).toMatchObject({ weekStart: '2026-06-08', workedMinutes: 660 });
  });

  it('weekly-Modus: 5 x 11 h (55 h) ueberschreitet 48 h -> Befund am letzten Wochentag', () => {
    const days = elevenHourDays([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
    ]);
    const findings = evaluateWeeklyWorkTime(days, () => weeklyPkg);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.date).toBe('2026-06-05');
    expect(findings[0]?.finding.code).toBe('MAX_WEEKLY_WORKTIME_EXCEEDED');
    // 4 x 11 h = 44 h <= 48 h: kein Befund.
    expect(evaluateWeeklyWorkTime(days.slice(0, 4), () => weeklyPkg)).toHaveLength(0);
  });

  it('daily-Modus erzeugt KEINEN Wochenbefund (heutiges Recht: taeglicher Massstab)', () => {
    const days = elevenHourDays([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
    ]);
    expect(evaluateWeeklyWorkTime(days, () => ARBZG_2026_V1)).toHaveLength(0);
  });
});

describe('evaluateWorkDay: Tagesmaxima haengen am Modus (B-11)', () => {
  const elevenHours = {
    date: '2026-06-01',
    intervals: [{ start: d('2026-06-01T06:00:00Z'), end: d('2026-06-01T17:45:00Z') }],
    breaks: [{ start: d('2026-06-01T12:00:00Z'), end: d('2026-06-01T12:45:00Z') }],
    previousShiftEnd: null,
  };

  it('daily-Modus: 11 h Arbeit verletzt die 10-h-Grenze', () => {
    const codes = evaluateWorkDay(elevenHours, ARBZG_2026_V1).map((f) => f.code);
    expect(codes).toContain('MAX_DAILY_WORKTIME_EXTENDED_EXCEEDED');
  });

  it('weekly-Modus: einzelne Tage duerfen laenger sein - kein Tagesmaximum-Befund', () => {
    const codes = evaluateWorkDay(elevenHours, weeklyPkg).map((f) => f.code);
    expect(codes).not.toContain('MAX_DAILY_WORKTIME_EXTENDED_EXCEEDED');
    expect(codes).not.toContain('MAX_DAILY_WORKTIME_EXCEEDED');
    // Pausen-/Ruhe-Regeln gelten unveraendert weiter.
  });
});
