/**
 * Zaehlt Arbeitstage (Mo–Fr, ohne Feiertage) im inklusiven Zeitraum
 * [fromIso, toIso]. `isHoliday` wird vom Aufrufer mit dem Feiertagskalender des
 * passenden Bundeslands versorgt. Grundlage fuer Urlaubsabzug/Reporting.
 */
export function countWorkingDays(
  fromIso: string,
  toIso: string,
  isHoliday: (isoDate: string) => boolean,
): number {
  const start = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }

  let count = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const iso = cursor.toISOString().slice(0, 10);
    const weekday = cursor.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    if (!isWeekend && !isHoliday(iso)) {
      count += 1;
    }
  }
  return count;
}
