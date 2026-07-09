/** Deutsche Bundesländer (ISO-3166-2:DE Kürzel). */
export type Bundesland =
  | 'BW'
  | 'BY'
  | 'BE'
  | 'BB'
  | 'HB'
  | 'HH'
  | 'HE'
  | 'MV'
  | 'NI'
  | 'NW'
  | 'RP'
  | 'SL'
  | 'SN'
  | 'ST'
  | 'SH'
  | 'TH';

export interface Holiday {
  /** ISO-Datum YYYY-MM-DD. */
  date: string;
  name: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Ostersonntag (gregorianisch, Algorithmus nach Meeus/Jones/Butcher). */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDays(year: number, month: number, day: number, delta: number): string {
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + delta);
  return ymd(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

/** Buß- und Bettag: der Mittwoch vor dem 23. November (nur Sachsen). */
function bussUndBettag(year: number): string {
  const date = new Date(Date.UTC(year, 10, 22));
  while (date.getUTCDay() !== 3) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Gesetzliche Feiertage eines Jahres je Bundesland. Bundesweite Feiertage plus
 * landesspezifische Regelungen (statewide; rein kommunale Feiertage wie das
 * Augsburger Friedensfest sind bewusst nicht enthalten).
 */
export function germanHolidays(year: number, land: Bundesland): Holiday[] {
  const easter = easterSunday(year);
  const fromEaster = (delta: number): string => addDays(year, easter.month, easter.day, delta);

  const holidays: Holiday[] = [
    { date: ymd(year, 1, 1), name: 'Neujahr' },
    { date: fromEaster(-2), name: 'Karfreitag' },
    { date: fromEaster(1), name: 'Ostermontag' },
    { date: ymd(year, 5, 1), name: 'Tag der Arbeit' },
    { date: fromEaster(39), name: 'Christi Himmelfahrt' },
    { date: fromEaster(50), name: 'Pfingstmontag' },
    { date: ymd(year, 10, 3), name: 'Tag der Deutschen Einheit' },
    { date: ymd(year, 12, 25), name: '1. Weihnachtstag' },
    { date: ymd(year, 12, 26), name: '2. Weihnachtstag' },
  ];

  const add = (applies: boolean, date: string, name: string): void => {
    if (applies) holidays.push({ date, name });
  };

  add(['BW', 'BY', 'ST'].includes(land), ymd(year, 1, 6), 'Heilige Drei Könige');
  add(['BE', 'MV'].includes(land), ymd(year, 3, 8), 'Internationaler Frauentag');
  add(['BW', 'BY', 'HE', 'NW', 'RP', 'SL'].includes(land), fromEaster(60), 'Fronleichnam');
  add(land === 'SL', ymd(year, 8, 15), 'Mariä Himmelfahrt');
  add(land === 'TH', ymd(year, 9, 20), 'Weltkindertag');
  add(
    ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'].includes(land),
    ymd(year, 10, 31),
    'Reformationstag',
  );
  add(['BW', 'BY', 'NW', 'RP', 'SL'].includes(land), ymd(year, 11, 1), 'Allerheiligen');
  add(land === 'SN', bussUndBettag(year), 'Buß- und Bettag');

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/** Prüft, ob ein ISO-Datum (YYYY-MM-DD) im Bundesland ein Feiertag ist. */
export function isGermanHoliday(isoDate: string, land: Bundesland): boolean {
  const year = Number(isoDate.slice(0, 4));
  return germanHolidays(year, land).some((holiday) => holiday.date === isoDate);
}

/**
 * Gemeindespezifische Feiertage (C-08) als EXPLIZITE Schluessel am Einsatzort:
 * ZeitVault fuehrt bewusst keine amtliche Gemeindeliste (AGS) - welche
 * Gemeinde-Ausnahme gilt, pflegt die Administration je Einsatzort
 * (rechtsverbindlich sind die Landesfeiertagsgesetze):
 * - 'fronleichnam': einzelne Gemeinden in SN und TH,
 * - 'mariae_himmelfahrt': Gemeinden in BY mit ueberwiegend katholischer
 *   Bevoelkerung (im SL bereits landesweit),
 * - 'friedensfest': Stadtgebiet Augsburg (08.08.).
 */
export type MunicipalHolidayKey = 'fronleichnam' | 'mariae_himmelfahrt' | 'friedensfest';

export const MUNICIPAL_HOLIDAY_KEYS: readonly MunicipalHolidayKey[] = [
  'fronleichnam',
  'mariae_himmelfahrt',
  'friedensfest',
];

/** Feiertagsrelevanter Ausschnitt eines Einsatzortes (ADR-0016, C-08). */
export interface HolidayLocation {
  /** Bundesland; ohne Bundesland keine Feiertagsbewertung (Landesrecht). */
  stateCode: Bundesland | null;
  municipalHolidayKeys?: readonly MunicipalHolidayKey[];
}

/**
 * Gesetzliche Feiertage eines Jahres fuer einen EINSATZORT (C-08): Kalender
 * des Bundeslandes plus die am Einsatzort gepflegten Gemeinde-Ausnahmen.
 * Bereits landesweit geltende Tage werden nicht dupliziert. Ohne Bundesland
 * gibt es keine Bewertung (leere Liste) - Feiertagsrecht ist Landesrecht.
 */
export function holidaysForLocation(year: number, location: HolidayLocation): Holiday[] {
  if (location.stateCode === null) return [];
  const holidays = germanHolidays(year, location.stateCode);
  const easter = easterSunday(year);
  const municipal: Record<MunicipalHolidayKey, Holiday> = {
    fronleichnam: {
      date: addDays(year, easter.month, easter.day, 60),
      name: 'Fronleichnam',
    },
    mariae_himmelfahrt: { date: ymd(year, 8, 15), name: 'Mariä Himmelfahrt' },
    friedensfest: { date: ymd(year, 8, 8), name: 'Augsburger Friedensfest' },
  };
  for (const key of location.municipalHolidayKeys ?? []) {
    const holiday = municipal[key];
    if (holiday && !holidays.some((h) => h.date === holiday.date)) {
      holidays.push(holiday);
    }
  }
  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/** Prüft, ob ein ISO-Datum am Einsatzort ein gesetzlicher Feiertag ist (C-08). */
export function isHolidayAtLocation(isoDate: string, location: HolidayLocation): boolean {
  const year = Number(isoDate.slice(0, 4));
  return holidaysForLocation(year, location).some((holiday) => holiday.date === isoDate);
}
