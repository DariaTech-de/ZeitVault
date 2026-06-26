import { describe, expect, it } from 'vitest';
import {
  evaluateBreaks,
  evaluateDailyWorkTime,
  evaluateRestPeriod,
  evaluateWorkDay,
  intervalMinutes,
  requiredBreakMinutes,
  totalMinutes,
} from './engine';
import { ARBZG_2026_V1, selectRulePackage } from './rule-packages';
import type { RulePackage, WorkDayInput } from './types';

const params = ARBZG_2026_V1.params;
const d = (iso: string): Date => new Date(iso);

describe('intervalMinutes', () => {
  it('berechnet die Dauer in Minuten', () => {
    expect(intervalMinutes({ start: d('2026-06-26T08:00:00Z'), end: d('2026-06-26T12:00:00Z') })).toBe(
      240,
    );
  });

  it('wirft bei Ende vor Beginn', () => {
    expect(() =>
      intervalMinutes({ start: d('2026-06-26T12:00:00Z'), end: d('2026-06-26T08:00:00Z') }),
    ).toThrow();
  });
});

describe('totalMinutes', () => {
  it('summiert mehrere Intervalle', () => {
    expect(
      totalMinutes([
        { start: d('2026-06-26T08:00:00Z'), end: d('2026-06-26T12:00:00Z') },
        { start: d('2026-06-26T12:30:00Z'), end: d('2026-06-26T16:30:00Z') },
      ]),
    ).toBe(480);
  });
});

describe('requiredBreakMinutes', () => {
  it('keine Pause unter 6 h', () => {
    expect(requiredBreakMinutes(5 * 60, params)).toBe(0);
  });
  it('30 min ab 6 h', () => {
    expect(requiredBreakMinutes(6 * 60, params)).toBe(30);
    expect(requiredBreakMinutes(8 * 60, params)).toBe(30);
  });
  it('45 min ab 9 h', () => {
    expect(requiredBreakMinutes(9 * 60, params)).toBe(45);
  });
});

describe('evaluateDailyWorkTime', () => {
  it('keine Befunde bis 8 h', () => {
    expect(evaluateDailyWorkTime(8 * 60, params)).toHaveLength(0);
  });
  it('Warnung zwischen 8 h und 10 h', () => {
    const findings = evaluateDailyWorkTime(9 * 60, params);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('MAX_DAILY_WORKTIME_EXCEEDED');
    expect(findings[0]?.severity).toBe('warning');
  });
  it('Verstoss ueber 10 h', () => {
    const findings = evaluateDailyWorkTime(10 * 60 + 1, params);
    expect(findings[0]?.code).toBe('MAX_DAILY_WORKTIME_EXTENDED_EXCEEDED');
    expect(findings[0]?.severity).toBe('violation');
  });
});

describe('evaluateBreaks', () => {
  it('fehlende Pflichtpause', () => {
    const findings = evaluateBreaks(7 * 60, 0, params);
    expect(findings[0]?.code).toBe('BREAK_MISSING');
  });
  it('zu kurze Pause', () => {
    const findings = evaluateBreaks(9 * 60, 30, params);
    expect(findings[0]?.code).toBe('BREAK_TOO_SHORT');
  });
  it('ausreichende Pause', () => {
    expect(evaluateBreaks(9 * 60, 45, params)).toHaveLength(0);
  });
});

describe('evaluateRestPeriod', () => {
  it('keine Bewertung ohne Vortagsende', () => {
    expect(evaluateRestPeriod(null, d('2026-06-26T08:00:00Z'), params)).toHaveLength(0);
  });
  it('Verstoss bei weniger als 11 h Ruhezeit', () => {
    const findings = evaluateRestPeriod(
      d('2026-06-25T23:00:00Z'),
      d('2026-06-26T08:00:00Z'),
      params,
    );
    expect(findings[0]?.code).toBe('REST_PERIOD_TOO_SHORT');
  });
  it('keine Bewertung bei genau 11 h Ruhezeit', () => {
    expect(
      evaluateRestPeriod(d('2026-06-25T21:00:00Z'), d('2026-06-26T08:00:00Z'), params),
    ).toHaveLength(0);
  });
});

describe('evaluateWorkDay', () => {
  it('aggregiert Hoechstarbeitszeit-, Pausen- und Ruhezeit-Befunde', () => {
    const input: WorkDayInput = {
      date: '2026-06-26',
      // 09:30 h gearbeitet (570 min)
      intervals: [{ start: d('2026-06-26T08:00:00Z'), end: d('2026-06-26T17:30:00Z') }],
      // nur 30 min Pause (erforderlich waeren 45 min)
      breaks: [{ start: d('2026-06-26T12:00:00Z'), end: d('2026-06-26T12:30:00Z') }],
      // nur 9 h Ruhezeit zum Vortag
      previousShiftEnd: d('2026-06-25T23:00:00Z'),
    };
    const codes = evaluateWorkDay(input, ARBZG_2026_V1).map((f) => f.code);
    expect(codes).toContain('MAX_DAILY_WORKTIME_EXCEEDED');
    expect(codes).toContain('BREAK_TOO_SHORT');
    expect(codes).toContain('REST_PERIOD_TOO_SHORT');
  });

  it('konformer Tag erzeugt keine Befunde', () => {
    const input: WorkDayInput = {
      date: '2026-06-26',
      intervals: [{ start: d('2026-06-26T08:00:00Z'), end: d('2026-06-26T16:00:00Z') }],
      breaks: [{ start: d('2026-06-26T12:00:00Z'), end: d('2026-06-26T12:30:00Z') }],
      previousShiftEnd: d('2026-06-25T20:00:00Z'),
    };
    expect(evaluateWorkDay(input, ARBZG_2026_V1)).toHaveLength(0);
  });
});

describe('selectRulePackage', () => {
  const current: RulePackage = { ...ARBZG_2026_V1, validTo: '2026-12-31' };
  const future: RulePackage = {
    ...ARBZG_2026_V1,
    version: '2027.1',
    validFrom: '2027-01-01',
    validTo: null,
  };

  it('waehlt das fuer das Datum gueltige Paket', () => {
    expect(selectRulePackage([current, future], '2026-06-26')).toBe(current);
    expect(selectRulePackage([current, future], '2027-03-01')).toBe(future);
  });

  it('liefert null ausserhalb jedes Gueltigkeitszeitraums', () => {
    expect(selectRulePackage([current], '2025-12-31')).toBeNull();
  });
});
