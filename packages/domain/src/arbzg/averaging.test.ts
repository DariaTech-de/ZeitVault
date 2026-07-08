import { describe, expect, it } from 'vitest';
import { averagingWindow, evaluateWorkingTimeAverage } from './averaging';
import { ARBZG_2026_V1 } from './rule-packages';
import type { RulePackage } from './types';

// B-01: § 3 ArbZG - Verlaengerung auf 10 h nur bei Ausgleich auf 8 h im
// werktaeglichen DURCHSCHNITT innerhalb von 6 Kalendermonaten ODER 24 Wochen
// (konfigurierbar). B-04: § 6 Abs. 2 - Nachtarbeitnehmer haben eine KUERZERE
// Ausgleichsperiode (1 Kalendermonat / 4 Wochen).
const pkg = () => ARBZG_2026_V1;

/** 10-h-Tage Mo-Fr ueber [from, to] (ISO-Datums-Schleife, tz-frei). */
function tenHourWeekdays(from: string, to: string): Array<{ date: string; workedMinutes: number }> {
  const days: Array<{ date: string; workedMinutes: number }> = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    const dow = cursor.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      days.push({ date: cursor.toISOString().slice(0, 10), workedMinutes: 600 });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

describe('averagingWindow (B-01/B-04)', () => {
  it('Standard: rollierende 6 Monate; Nachtarbeitnehmer: rollierender 1 Monat', () => {
    // Rollierendes Fenster mit exklusiver Untergrenze: (to - 6 Monate, to].
    expect(averagingWindow('2026-06-30', ARBZG_2026_V1.params, false)).toEqual({
      from: '2025-12-31',
      to: '2026-06-30',
    });
    expect(averagingWindow('2026-06-30', ARBZG_2026_V1.params, true)).toEqual({
      from: '2026-05-31',
      to: '2026-06-30',
    });
  });

  it('Wochen-Konfiguration: 24 Wochen statt 6 Monate (Monate ODER Wochen)', () => {
    const weekly: RulePackage = {
      ...ARBZG_2026_V1,
      params: { ...ARBZG_2026_V1.params, averagingPeriodMonths: 0, averagingPeriodWeeks: 24 },
    };
    expect(averagingWindow('2026-06-30', weekly.params, false)).toEqual({
      from: '2026-01-14', // 24*7 = 168 Tage zurueck, exklusive Untergrenze
      to: '2026-06-30',
    });
  });
});

describe('evaluateWorkingTimeAverage (B-01)', () => {
  it('AK: 10-h-Tage ohne Ausgleich ueberschreiten den 8-h-Werktagsdurchschnitt', () => {
    // Mo-Fr je 10 h ueber 6 Monate: Durchschnitt je WERKTAG (Mo-Sa)
    // = 10 h * 5/6 = 8,33 h > 8 h -> Verstoss.
    const days = tenHourWeekdays('2026-01-01', '2026-06-30');
    const findings = evaluateWorkingTimeAverage(days, '2026-06-30', pkg, false);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('AVERAGING_LIMIT_EXCEEDED');
  });

  it('mit Ausgleich (8-h-Tage) bleibt der Durchschnitt eingehalten', () => {
    const days = tenHourWeekdays('2026-01-01', '2026-06-30').map((d) => ({
      ...d,
      workedMinutes: 480,
    }));
    expect(evaluateWorkingTimeAverage(days, '2026-06-30', pkg, false)).toHaveLength(0);
  });

  it('B-04: Nachtarbeitnehmer werden ueber die KUERZERE Periode gemessen (Abweichung zu B-01)', () => {
    // Nur der Juni ist ueberzogen (10-h-Tage); Januar-Mai sind frei.
    const days = tenHourWeekdays('2026-06-01', '2026-06-30');
    // Normaler Mitarbeiter, 6-Monats-Fenster: der freie Vorlauf gleicht aus.
    expect(evaluateWorkingTimeAverage(days, '2026-06-30', pkg, false)).toHaveLength(0);
    // Nachtarbeitnehmer, 1-Monats-Fenster: kein Ausgleich moeglich -> Verstoss.
    const night = evaluateWorkingTimeAverage(days, '2026-06-30', pkg, true);
    expect(night).toHaveLength(1);
    expect(night[0]?.code).toBe('AVERAGING_LIMIT_EXCEEDED');
  });
});
