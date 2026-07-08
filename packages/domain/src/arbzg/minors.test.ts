import { describe, expect, it } from 'vitest';
import { evaluateWorkDay, requiredBreakMinutes } from './engine';
import { JARBSCHG_2026_V1, selectLawPackage } from './rule-packages';
import { evaluateWeeklyWorkTime } from './weekly';
import { evaluateAllowedWorkWindow } from './work-window';

// B-07: JArbSchG fuer Beschaeftigte unter 18 - eigenes, strengeres Regelwerk
// (8 h/Tag, 40 h/Woche; Pausen 30 min bei > 4,5-6 h, 60 min bei > 6 h;
// 12 h Freizeit; Nachtruhe/Beschaeftigungsfenster). Aktivierung automatisch
// ueber das Geburtsdatum, Umschaltung am 18. Geburtstag.
const d = (iso: string): Date => new Date(iso);

describe('selectLawPackage: automatische Aktivierung/Umschaltung per Geburtsdatum (B-07)', () => {
  it('unter 18 gilt das JArbSchG-Paket, ohne Geburtsdatum das ArbZG', () => {
    expect(selectLawPackage('2026-07-08', '2009-08-01')?.id).toBe('jarbschg.de');
    expect(selectLawPackage('2026-07-08', null)?.id).toBe('arbzg.de');
    expect(selectLawPackage('2026-07-08', '1990-01-01')?.id).toBe('arbzg.de');
  });

  it('am 18. Geburtstag wird automatisch auf das ArbZG umgeschaltet', () => {
    const birth = '2008-07-09';
    expect(selectLawPackage('2026-07-08', birth)?.id).toBe('jarbschg.de'); // Tag davor
    expect(selectLawPackage('2026-07-09', birth)?.id).toBe('arbzg.de'); // 18. Geburtstag
  });
});

describe('JArbSchG-Regelwerk (B-07)', () => {
  const params = JARBSCHG_2026_V1.params;

  it('Pausenstaffel § 11: > 4,5 h -> 30 min, > 6 h -> 60 min', () => {
    expect(requiredBreakMinutes(4 * 60 + 30, params)).toBe(0);
    expect(requiredBreakMinutes(4 * 60 + 31, params)).toBe(30);
    expect(requiredBreakMinutes(6 * 60, params)).toBe(30);
    expect(requiredBreakMinutes(6 * 60 + 1, params)).toBe(60);
  });

  it('5 h ohne Pause: fuer Minderjaehrige ein Verstoss, fuer Erwachsene nicht', () => {
    const day = {
      date: '2026-06-01',
      intervals: [{ start: d('2026-06-01T06:00:00Z'), end: d('2026-06-01T11:00:00Z') }],
      breaks: [],
      previousShiftEnd: null,
    };
    const minor = evaluateWorkDay(day, JARBSCHG_2026_V1).map((f) => f.code);
    expect(minor).toContain('BREAK_MISSING');
    expect(minor).toContain('CONTINUOUS_WORK_EXCEEDED'); // > 4,5 h am Stueck
    const adult = evaluateWorkDay(day, selectLawPackage('2026-06-01', null)!).map((f) => f.code);
    expect(adult).not.toContain('BREAK_MISSING');
  });

  it('40-h-Woche gilt ZUSAETZLICH zur 8-h-Tagesgrenze (beide Massstaebe)', () => {
    // 5 x 8,5 h = 42,5 h: jeder Tag verletzt 8 h, die Woche verletzt 40 h.
    const days = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'].map(
      (date) => ({ date, workedMinutes: 8 * 60 + 30 }),
    );
    const weekly = evaluateWeeklyWorkTime(days, () => JARBSCHG_2026_V1);
    expect(weekly).toHaveLength(1);
    expect(weekly[0]?.finding.code).toBe('MAX_WEEKLY_WORKTIME_EXCEEDED');
    const daily = evaluateWorkDay(
      {
        date: '2026-06-01',
        intervals: [{ start: d('2026-06-01T06:00:00Z'), end: d('2026-06-01T15:15:00Z') }],
        breaks: [{ start: d('2026-06-01T10:00:00Z'), end: d('2026-06-01T10:45:00Z') }],
        previousShiftEnd: null,
      },
      JARBSCHG_2026_V1,
    ).map((f) => f.code);
    expect(daily).toContain('MAX_DAILY_WORKTIME_EXTENDED_EXCEEDED');
  });

  it('Beschaeftigungsfenster: Arbeit um 20:30 lokal verletzt die Nachtruhe (Erwachsene nicht)', () => {
    const intervals = [
      { start: d('2026-06-01T16:00:00Z'), end: d('2026-06-01T19:00:00Z') }, // 18:00-21:00 lokal
    ];
    const minor = evaluateAllowedWorkWindow(intervals, 'Europe/Berlin', JARBSCHG_2026_V1.params);
    expect(minor.map((f) => f.code)).toContain('WORK_OUTSIDE_ALLOWED_WINDOW');
    const adult = evaluateAllowedWorkWindow(
      intervals,
      'Europe/Berlin',
      selectLawPackage('2026-06-01', null)!.params,
    );
    expect(adult).toHaveLength(0);
  });
});
