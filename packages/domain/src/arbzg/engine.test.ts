import { describe, expect, it } from 'vitest';
import {
  countableBreakMinutes,
  evaluateBreaks,
  evaluateContinuousWork,
  evaluateDailyWorkTime,
  evaluateRestPeriod,
  evaluateWorkDay,
  intervalMinutes,
  requiredBreakMinutes,
  totalMinutes,
} from './engine';
import { ARBZG_2026_V1, selectRulePackage } from './rule-packages';
import type { BreakInterval, RulePackage, WorkDayInput } from './types';

const params = ARBZG_2026_V1.params;
const d = (iso: string): Date => new Date(iso);

/** Pausenintervalle gegebener Laengen (Minuten) ab 12:00 Uhr, mit Abstand. */
function breaksOf(...minutes: number[]): BreakInterval[] {
  let cursor = new Date('2026-06-26T12:00:00Z').getTime();
  return minutes.map((m) => {
    const start = new Date(cursor);
    const end = new Date(cursor + m * 60_000);
    cursor = end.getTime() + 60 * 60_000; // 1 h Abstand zwischen Pausen
    return { start, end };
  });
}

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

  // B-12-Basis (BL-6): Zeitdauern sind IMMER ganze Minuten. Die Ableitung
  // Sekunden -> Minuten ist eine explizite Rundungsregel (Standard:
  // kaufmaennisch je Intervall); die mandantenweite Konfiguration folgt mit
  // B-12. Niemals Bruchminuten (Float) in der Bewertung.
  it('rundet Sekunden kaufmaennisch auf ganze Minuten (nie Bruchminuten)', () => {
    const base = '2026-06-26T08:00:';
    expect(intervalMinutes({ start: d(`${base}00Z`), end: d('2026-06-26T08:00:29Z') })).toBe(0);
    expect(intervalMinutes({ start: d(`${base}00Z`), end: d('2026-06-26T08:00:30Z') })).toBe(1);
    expect(intervalMinutes({ start: d(`${base}00Z`), end: d('2026-06-26T08:10:29Z') })).toBe(10);
    expect(intervalMinutes({ start: d(`${base}00Z`), end: d('2026-06-26T08:10:30Z') })).toBe(11);
    expect(
      Number.isInteger(
        intervalMinutes({ start: d(`${base}17Z`), end: d('2026-06-26T09:23:41Z') }),
      ),
    ).toBe(true);
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

// § 4 Satz 1 ArbZG: "Die Arbeit ist durch im voraus feststehende Ruhepausen von
// mindestens 30 Minuten bei einer Arbeitszeit von MEHR ALS sechs bis zu neun
// Stunden und 45 Minuten bei einer Arbeitszeit von MEHR ALS neun Stunden
// insgesamt zu unterbrechen."
// Verbindliche Matrix (Akzeptanzkriterium B-02):
//   6:00 h -> 0 min | 6:01 h -> 30 min | 9:00 h -> 30 min | 9:01 h -> 45 min
describe('requiredBreakMinutes (Grenzen nach § 4 Satz 1: "mehr als")', () => {
  it('keine Pause bis einschliesslich 6:00 h', () => {
    expect(requiredBreakMinutes(5 * 60, params)).toBe(0);
    expect(requiredBreakMinutes(6 * 60, params)).toBe(0);
  });
  it('30 min ab 6:01 h', () => {
    expect(requiredBreakMinutes(6 * 60 + 1, params)).toBe(30);
    expect(requiredBreakMinutes(8 * 60, params)).toBe(30);
  });
  it('30 min noch bei genau 9:00 h ("bis zu neun Stunden")', () => {
    expect(requiredBreakMinutes(9 * 60, params)).toBe(30);
  });
  it('45 min ab 9:01 h', () => {
    expect(requiredBreakMinutes(9 * 60 + 1, params)).toBe(45);
  });
});

// § 4 Satz 2 ArbZG: "Die Ruhepausen ... koennen in Zeitabschnitte von jeweils
// mindestens 15 Minuten aufgeteilt werden." Kuerzere Abschnitte sind keine
// Ruhepausen und zaehlen nicht.
describe('countableBreakMinutes (§ 4 Satz 2: Abschnitte von je >= 15 min)', () => {
  it('zaehlt nur Abschnitte von mindestens 15 Minuten', () => {
    expect(countableBreakMinutes(breaksOf(10, 10, 10), params)).toBe(0);
    expect(countableBreakMinutes(breaksOf(15, 15), params)).toBe(30);
    expect(countableBreakMinutes(breaksOf(10, 20), params)).toBe(20);
  });
});

describe('evaluateBreaks', () => {
  it('fehlende Pflichtpause', () => {
    const findings = evaluateBreaks(7 * 60, [], params);
    expect(findings[0]?.code).toBe('BREAK_MISSING');
    expect(findings[0]?.severity).toBe('violation');
  });

  it('3x 10 min zaehlen nicht als Ruhepause (§ 4 Satz 2)', () => {
    const findings = evaluateBreaks(7 * 60, breaksOf(10, 10, 10), params);
    expect(findings[0]?.code).toBe('BREAK_MISSING');
    expect(findings[0]?.details.takenBreakMinutes).toBe(30);
    expect(findings[0]?.details.countableBreakMinutes).toBe(0);
  });

  it('Aufteilung in 15 + 15 min ist zulaessig', () => {
    expect(evaluateBreaks(7 * 60, breaksOf(15, 15), params)).toHaveLength(0);
  });

  it('zu kurze Pause bei mehr als 9 h', () => {
    const findings = evaluateBreaks(9 * 60 + 1, breaksOf(30), params);
    expect(findings[0]?.code).toBe('BREAK_TOO_SHORT');
    expect(findings[0]?.details.requiredBreakMinutes).toBe(45);
    expect(findings[0]?.details.countableBreakMinutes).toBe(30);
  });

  it('30 min genuegen bei genau 9:00 h', () => {
    expect(evaluateBreaks(9 * 60, breaksOf(30), params)).toHaveLength(0);
  });
});

// § 4 Satz 3 ArbZG: "Laenger als sechs Stunden HINTEREINANDER duerfen
// Arbeitnehmer nicht ohne Ruhepause beschaeftigt werden." Eine Unterbrechung
// unter 15 Minuten ist keine Ruhepause (Satz 2) und unterbricht den Block nicht.
describe('evaluateContinuousWork (§ 4 Satz 3: max. 6 h am Stueck)', () => {
  it('6:30 h ohne Pause ist ein Verstoss', () => {
    const findings = evaluateContinuousWork(
      [{ start: d('2026-06-26T08:00:00Z'), end: d('2026-06-26T14:30:00Z') }],
      params,
    );
    expect(findings[0]?.code).toBe('CONTINUOUS_WORK_EXCEEDED');
    expect(findings[0]?.severity).toBe('violation');
    expect(findings[0]?.details.longestStretchMinutes).toBe(390);
  });

  it('genau 6:00 h am Stueck ist zulaessig', () => {
    expect(
      evaluateContinuousWork(
        [{ start: d('2026-06-26T08:00:00Z'), end: d('2026-06-26T14:00:00Z') }],
        params,
      ),
    ).toHaveLength(0);
  });

  it('eine 10-min-Unterbrechung unterbricht den Block NICHT (4 h + 10 min + 3 h)', () => {
    const findings = evaluateContinuousWork(
      [
        { start: d('2026-06-26T08:00:00Z'), end: d('2026-06-26T12:00:00Z') },
        { start: d('2026-06-26T12:10:00Z'), end: d('2026-06-26T15:10:00Z') },
      ],
      params,
    );
    expect(findings[0]?.code).toBe('CONTINUOUS_WORK_EXCEEDED');
    expect(findings[0]?.details.longestStretchMinutes).toBe(420);
  });

  it('eine Ruhepause von 30 min unterbricht den Block (4 h + 30 min + 3 h)', () => {
    expect(
      evaluateContinuousWork(
        [
          { start: d('2026-06-26T08:00:00Z'), end: d('2026-06-26T12:00:00Z') },
          { start: d('2026-06-26T12:30:00Z'), end: d('2026-06-26T15:30:00Z') },
        ],
        params,
      ),
    ).toHaveLength(0);
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
  it('Bezugsgroesse ist die ARBEITSZEIT (netto), nicht die Anwesenheit', () => {
    // Anwesenheit 08:00-17:30 (9:30 h) mit 30 min Pause = 9:00 h Arbeitszeit.
    // § 4 Satz 1: "bis zu neun Stunden" -> 30 min Pause genuegen. Wuerde die
    // Engine aus der Brutto-Anwesenheit (9:30 h) ableiten, forderte sie 45 min.
    const input: WorkDayInput = {
      date: '2026-06-26',
      intervals: [
        { start: d('2026-06-26T08:00:00Z'), end: d('2026-06-26T12:00:00Z') },
        { start: d('2026-06-26T12:30:00Z'), end: d('2026-06-26T17:30:00Z') },
      ],
      breaks: [{ start: d('2026-06-26T12:00:00Z'), end: d('2026-06-26T12:30:00Z') }],
      previousShiftEnd: null,
    };
    const codes = evaluateWorkDay(input, ARBZG_2026_V1).map((f) => f.code);
    expect(codes).not.toContain('BREAK_MISSING');
    expect(codes).not.toContain('BREAK_TOO_SHORT');
  });

  it('aggregiert Hoechstarbeitszeit-, Pausen-, Blocklaengen- und Ruhezeit-Befunde', () => {
    const input: WorkDayInput = {
      date: '2026-06-26',
      // 4:00 h + 6:15 h = 10:15 h Arbeitszeit; zweiter Block > 6 h am Stueck.
      intervals: [
        { start: d('2026-06-26T08:00:00Z'), end: d('2026-06-26T12:00:00Z') },
        { start: d('2026-06-26T12:30:00Z'), end: d('2026-06-26T18:45:00Z') },
      ],
      // nur 30 min Pause (erforderlich waeren 45 min bei > 9 h)
      breaks: [{ start: d('2026-06-26T12:00:00Z'), end: d('2026-06-26T12:30:00Z') }],
      // nur 9 h Ruhezeit zum Vortag
      previousShiftEnd: d('2026-06-25T23:00:00Z'),
    };
    const codes = evaluateWorkDay(input, ARBZG_2026_V1).map((f) => f.code);
    expect(codes).toContain('MAX_DAILY_WORKTIME_EXTENDED_EXCEEDED');
    expect(codes).toContain('BREAK_TOO_SHORT');
    expect(codes).toContain('CONTINUOUS_WORK_EXCEEDED');
    expect(codes).toContain('REST_PERIOD_TOO_SHORT');
  });

  it('konformer Tag erzeugt keine Befunde', () => {
    const input: WorkDayInput = {
      date: '2026-06-26',
      intervals: [
        { start: d('2026-06-26T08:00:00Z'), end: d('2026-06-26T12:00:00Z') },
        { start: d('2026-06-26T12:30:00Z'), end: d('2026-06-26T16:30:00Z') },
      ],
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
