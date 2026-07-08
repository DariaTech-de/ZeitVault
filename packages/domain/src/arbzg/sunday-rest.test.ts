import { describe, expect, it } from 'vitest';
import { ARBZG_2026_V1 } from './rule-packages';
import { evaluateSundayHolidayRest } from './sunday-rest';

// B-06: §§ 9-11 ArbZG - Sonn-/Feiertagsruhe: mindestens 15 beschaeftigungs-
// freie Sonntage im Jahr; Ersatzruhetag (beschaeftigungsfreier Werktag)
// binnen 2 Wochen (Sonntagsarbeit) bzw. 8 Wochen (Feiertagsarbeit), mit
// Fristueberwachung und Warnung VOR Fristablauf.
const pkg = () => ARBZG_2026_V1;
const noHoliday = () => false;

function workedDays(dates: string[]): Array<{ date: string; workedMinutes: number }> {
  return dates.map((date) => ({ date, workedMinutes: 480 }));
}

/** Alle Tage in [from, to] als gearbeitet (auch Sa/So). */
function workedRange(from: string, to: string): Array<{ date: string; workedMinutes: number }> {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return workedDays(days);
}

describe('evaluateSundayHolidayRest (B-06)', () => {
  // 2026-06-07 ist ein Sonntag.
  it('Sonntagsarbeit mit beschaeftigungsfreiem Werktag binnen 2 Wochen: kein Befund', () => {
    const days = workedDays(['2026-06-07']); // nur der Sonntag gearbeitet
    // Der Montag 08.06. ist beschaeftigungsfrei (kein Eintrag) und liegt vor heute.
    const findings = evaluateSundayHolidayRest(days, noHoliday, pkg, '2026-07-08');
    expect(findings).toEqual([]);
  });

  it('Frist abgelaufen ohne freien Werktag: SUNDAY_COMPENSATION_MISSING', () => {
    // Sonntag 07.06. gearbeitet und ALLE Tage bis ueber die Frist (21.06.) hinaus.
    const days = workedRange('2026-06-07', '2026-06-25');
    const findings = evaluateSundayHolidayRest(days, noHoliday, pkg, '2026-07-08');
    const codes = findings.map((f) => f.finding.code);
    expect(codes).toContain('SUNDAY_COMPENSATION_MISSING');
    expect(findings.find((f) => f.finding.code === 'SUNDAY_COMPENSATION_MISSING')?.date).toBe(
      '2026-06-07',
    );
  });

  it('Frist laeuft noch: Warnung vor Fristablauf (PENDING)', () => {
    // Sonntag 05.07. gearbeitet, seither jeden Tag - heute ist der 08.07.
    const days = workedRange('2026-07-05', '2026-07-08');
    const findings = evaluateSundayHolidayRest(days, noHoliday, pkg, '2026-07-08');
    const codes = findings.map((f) => f.finding.code);
    expect(codes).toContain('SUNDAY_COMPENSATION_PENDING');
    expect(codes).not.toContain('SUNDAY_COMPENSATION_MISSING');
  });

  it('Feiertagsarbeit hat die laengere 8-Wochen-Frist', () => {
    // Feiertag Mi 03.06.2026 (fiktiv per Stub) gearbeitet; freier Werktag erst
    // am 20.07. - innerhalb von 8 Wochen -> kein Befund. Alle Tage dazwischen
    // gearbeitet.
    const days = workedRange('2026-06-03', '2026-07-19');
    const isHoliday = (d: string) => d === '2026-06-03';
    const findings = evaluateSundayHolidayRest(days, isHoliday, pkg, '2026-07-25');
    // 20.07. (Mo) ist beschaeftigungsfrei und liegt vor "heute" -> Ersatz erfuellt;
    // die Sonntage im Zeitraum sind dagegen ueberfaellig (eigene Befunde).
    expect(findings.map((f) => f.finding.code)).not.toContain('HOLIDAY_COMPENSATION_MISSING');
  });

  it('15 freie Sonntage nicht mehr erreichbar: Verstoss', () => {
    // Alle Sonntage von Januar bis September arbeiten (~39 Sonntage bei 52).
    const sundays: string[] = [];
    const cursor = new Date('2026-01-04T00:00:00Z'); // erster Sonntag 2026
    while (cursor.getUTCFullYear() === 2026 && cursor.getTime() <= Date.UTC(2026, 8, 30)) {
      sundays.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    const findings = evaluateSundayHolidayRest(workedDays(sundays), noHoliday, pkg, '2026-10-01');
    expect(findings.map((f) => f.finding.code)).toContain('MIN_FREE_SUNDAYS_UNREACHABLE');
  });
});
