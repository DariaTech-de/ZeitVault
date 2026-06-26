/**
 * Versioniertes Arbeitszeitmodell: Sollzeit je Wochentag (Minuten), mit
 * Gültigkeitszeitraum. Index 0 = Montag … 6 = Sonntag (ARCHITEKTUR.md Paragraf 8).
 */
export interface WorkTimeModel {
  id: string;
  name: string;
  /** Gültig ab (ISO-Datum, inklusiv). */
  validFrom: string;
  /** Gültig bis (ISO-Datum, inklusiv) oder null. */
  validTo: string | null;
  targetMinutesByWeekday: readonly number[];
}

/** Wochentag als Montag=0 … Sonntag=6. */
function weekdayMondayZero(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

/**
 * Sollzeit (Minuten) für ein Datum: 0 an Feiertagen, sonst die Vorgabe des
 * Wochentags aus dem Modell.
 */
export function targetMinutesForDate(
  model: WorkTimeModel,
  isoDate: string,
  isHoliday: boolean,
): number {
  if (isHoliday) return 0;
  const index = weekdayMondayZero(isoDate);
  return model.targetMinutesByWeekday[index] ?? 0;
}

/** Wählt das für ein Datum gültige Arbeitszeitmodell (jüngstes gewinnt). */
export function selectWorkTimeModel(
  models: readonly WorkTimeModel[],
  isoDate: string,
): WorkTimeModel | null {
  let selected: WorkTimeModel | null = null;
  for (const model of models) {
    const inRange =
      model.validFrom <= isoDate && (model.validTo === null || model.validTo >= isoDate);
    if (!inRange) continue;
    if (selected === null || model.validFrom >= selected.validFrom) {
      selected = model;
    }
  }
  return selected;
}
