import type { SurchargeResult, SurchargeRule, SurchargeRulePackage, TimeWindow, WorkSpan } from './types';

const MINUTES_PER_DAY = 1440;

/** Wochentag (0 = Sonntag) eines lokalen Kalenderdatums, zeitzonenunabhängig. */
export function dayOfWeek(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/** Addiert `delta` Tage zu einem lokalen Kalenderdatum (YYYY-MM-DD). */
export function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  base.setUTCDate(base.getUTCDate() + delta);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function inWindow(minuteOfDay: number, window: TimeWindow): boolean {
  const { startMinute, endMinute } = window;
  // Fenster über Mitternacht (z. B. 23:00–06:00): start > end.
  return startMinute <= endMinute
    ? minuteOfDay >= startMinute && minuteOfDay < endMinute
    : minuteOfDay >= startMinute || minuteOfDay < endMinute;
}

export interface SurchargeContext {
  /** Feiertagsprüfung für ein lokales Datum (mandantenspezifisch, je Bundesland). */
  isHoliday: (isoDate: string) => boolean;
}

/**
 * Berechnet zuschlagspflichtige Minuten je Regel über die gearbeiteten Spannen.
 *
 * Verrechnung: Nachtzuschlag ist unabhängig und kann mit Sonntag/Feiertag
 * kumulieren (§ 3b EStG). Bei der Tagesklassifikation hat der Feiertag Vorrang
 * vor dem Sonntag (fällt ein Feiertag auf einen Sonntag, greift NUR der
 * Feiertagszuschlag). Die Berechnung ist deterministisch und minutengenau.
 */
export function computeSurcharges(
  spans: readonly WorkSpan[],
  pkg: SurchargeRulePackage,
  ctx: SurchargeContext,
): SurchargeResult[] {
  const minutesByKind: Record<string, number> = {};
  for (const rule of pkg.rules) {
    minutesByKind[rule.kind] = 0;
  }

  for (const span of spans) {
    for (let i = 0; i < span.durationMinutes; i += 1) {
      const absolute = span.startMinute + i;
      const date = addDays(span.date, Math.floor(absolute / MINUTES_PER_DAY));
      const minuteOfDay = ((absolute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
      const holiday = ctx.isHoliday(date);
      const sunday = dayOfWeek(date) === 0;

      for (const rule of pkg.rules) {
        if (qualifies(rule, minuteOfDay, holiday, sunday)) {
          minutesByKind[rule.kind] = (minutesByKind[rule.kind] ?? 0) + 1;
        }
      }
    }
  }

  return pkg.rules.map((rule) => ({
    kind: rule.kind,
    label: rule.label,
    ratePercent: rule.ratePercent,
    minutes: minutesByKind[rule.kind] ?? 0,
  }));
}

function qualifies(
  rule: SurchargeRule,
  minuteOfDay: number,
  holiday: boolean,
  sunday: boolean,
): boolean {
  if (rule.kind === 'night') {
    return rule.window ? inWindow(minuteOfDay, rule.window) : false;
  }
  if (rule.kind === 'holiday') {
    return holiday;
  }
  // sunday: Feiertag hat Vorrang.
  return sunday && !holiday;
}
