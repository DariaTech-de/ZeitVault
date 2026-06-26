import { describe, expect, it } from 'vitest';
import { isGermanHoliday } from '../calendar/holidays';
import { computeSurcharges, dayOfWeek } from './compute';
import { ZUSCHLAEGE_BASIS_2026_V1 } from './rule-packages';
import type { SurchargeContext, WorkSpan } from './types';

const NO_HOLIDAY: SurchargeContext = { isHoliday: () => false };
const NW_HOLIDAY: SurchargeContext = { isHoliday: (iso) => isGermanHoliday(iso, 'NW') };

function minutesOf(results: ReturnType<typeof computeSurcharges>, kind: string): number {
  return results.find((r) => r.kind === kind)?.minutes ?? 0;
}

describe('computeSurcharges – reale Szenarien', () => {
  it('Tagschicht Mo 08:00–16:00 ohne Zuschläge', () => {
    // 2026-06-29 ist ein Montag.
    const spans: WorkSpan[] = [{ date: '2026-06-29', startMinute: 8 * 60, durationMinutes: 480 }];
    const r = computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, NO_HOLIDAY);
    expect(minutesOf(r, 'night')).toBe(0);
    expect(minutesOf(r, 'sunday')).toBe(0);
    expect(minutesOf(r, 'holiday')).toBe(0);
  });

  it('Nachtschicht Mo 22:00 – Di 06:00 = 480 Nachtminuten', () => {
    const spans: WorkSpan[] = [{ date: '2026-06-29', startMinute: 22 * 60, durationMinutes: 480 }];
    const r = computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, NO_HOLIDAY);
    expect(minutesOf(r, 'night')).toBe(480);
    expect(minutesOf(r, 'sunday')).toBe(0);
  });

  it('Abendschicht 18:00–22:00: nur 20:00–22:00 sind Nachtarbeit (120 min)', () => {
    const spans: WorkSpan[] = [{ date: '2026-06-29', startMinute: 18 * 60, durationMinutes: 240 }];
    const r = computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, NO_HOLIDAY);
    expect(minutesOf(r, 'night')).toBe(120);
  });

  it('Sonntagsschicht So 10:00–18:00 = 480 Sonntagsminuten', () => {
    // 2026-07-05 ist ein Sonntag.
    expect(dayOfWeek('2026-07-05')).toBe(0);
    const spans: WorkSpan[] = [{ date: '2026-07-05', startMinute: 10 * 60, durationMinutes: 480 }];
    const r = computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, NO_HOLIDAY);
    expect(minutesOf(r, 'sunday')).toBe(480);
    expect(minutesOf(r, 'holiday')).toBe(0);
    expect(minutesOf(r, 'night')).toBe(0);
  });

  it('Feiertagsschicht (Neujahr 2026-01-01) = 480 Feiertagsminuten', () => {
    const spans: WorkSpan[] = [{ date: '2026-01-01', startMinute: 8 * 60, durationMinutes: 480 }];
    const r = computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, NW_HOLIDAY);
    expect(minutesOf(r, 'holiday')).toBe(480);
    expect(minutesOf(r, 'sunday')).toBe(0);
  });

  it('Feiertag hat Vorrang vor Sonntag (Feiertag fällt auf einen Sonntag)', () => {
    // 2026-01-04 ist ein Sonntag; per synthetischem Kontext zugleich Feiertag.
    expect(dayOfWeek('2026-01-04')).toBe(0);
    const ctx: SurchargeContext = { isHoliday: (iso) => iso === '2026-01-04' };
    const spans: WorkSpan[] = [{ date: '2026-01-04', startMinute: 10 * 60, durationMinutes: 480 }];
    const r = computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, ctx);
    expect(minutesOf(r, 'holiday')).toBe(480);
    expect(minutesOf(r, 'sunday')).toBe(0);
  });

  it('Nacht- und Feiertagszuschlag kumulieren (Nachtarbeit an einem Feiertag)', () => {
    // Neujahr 2026-01-01, 22:00–24:00 (120 min) – Nacht UND Feiertag.
    const spans: WorkSpan[] = [{ date: '2026-01-01', startMinute: 22 * 60, durationMinutes: 120 }];
    const r = computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, NW_HOLIDAY);
    expect(minutesOf(r, 'night')).toBe(120);
    expect(minutesOf(r, 'holiday')).toBe(120);
  });

  it('Schicht über Mitternacht klassifiziert das Folgedatum korrekt (Sonntag → Montag)', () => {
    // So 2026-07-05 23:00 – Mo 2026-07-06 02:00 (180 min): 60 min Sonntag, 120 min Montag.
    const spans: WorkSpan[] = [{ date: '2026-07-05', startMinute: 23 * 60, durationMinutes: 180 }];
    const r = computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, NO_HOLIDAY);
    expect(minutesOf(r, 'sunday')).toBe(60);
    // Alle 180 min liegen im Nachtfenster (23:00–02:00).
    expect(minutesOf(r, 'night')).toBe(180);
  });
});
