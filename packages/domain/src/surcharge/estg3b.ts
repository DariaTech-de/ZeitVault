import { intervalMinutes } from '../arbzg/engine';
import type { Interval } from '../localtime/localtime';
import { addIsoDays, localDateOf, localDayStart, localMinuteOfDay } from '../localtime/localtime';
import { dayOfWeek } from './compute';

/**
 * Paragraf-3b-EStG-Klassifikation an ECHTEN Instants (C-01..C-05, C-07, K-04).
 *
 * Jede gearbeitete Minute wird an ihrem Instant klassifiziert: der Instant wird
 * in die Wanduhrzeit des Einsatzortes uebersetzt (DST-korrekt, K-01/K-04) und
 * gegen die GESETZLICHEN Fenster geprueft. Fenster und Saetze sind hier bewusst
 * NICHT konfigurierbar (ADR-0018: die gesetzliche Splittung ist Fakt, nicht
 * Einstellung); konfigurierbare TV-/BV-Saetze bilden dagegen `compute.ts` ab.
 * Rechtsstand: exakt die Werte der Spezifikation (Juli 2026) - Aenderungen nur
 * als neues, versioniertes Paket, nie durch stilles Anpassen.
 *
 * Fenster (Paragraf 3b Abs. 1-3 EStG):
 * - Nacht 25 %: 20:00-06:00 (C-01).
 * - Nacht 40 %: 00:00-04:00, NUR wenn die Arbeit VOR 0 Uhr aufgenommen wurde
 *   (C-02); ersetzt in diesem Fenster den 25-%-Satz (Partition, nie beide).
 * - Sonntag 50 %: 00:00-24:00 des Sonntags; FORTWIRKUNG auf 00:00-04:00 des
 *   Folgetags, wenn die Arbeit vor 0 Uhr aufgenommen wurde (C-03/C-03a).
 * - Feiertag 125 %: gesetzliche Feiertage 00:00-24:00 sowie 31.12. ab 14:00;
 *   Fortwirkung 00:00-04:00 des Folgetags wie beim Sonntag (C-04/C-04a).
 * - 150 %: 24.12. ab 14:00, 25.12., 26.12., 01.05. (C-05).
 *
 * Kumulation (C-07): Der NACHTzuschlag steht neben GENAU EINER Tagesklasse -
 * Nacht + Feiertag kumulieren. Die Tagesklassen selbst konkurrieren: es gilt
 * nur der hoechste Satz (150 % > 125 % > 50 %); ein Feiertag auf einem Sonntag
 * erzeugt also nur den Feiertagssatz. night40 und night25 partitionieren die
 * Nacht (jede Nachtminute hat genau eine Nachtklasse).
 *
 * Welche Tage FEIERTAGE sind, entscheidet der Aufrufer je Einsatzort
 * (`isHoliday`, C-08) - hier wird nur klassifiziert.
 *
 * Hinweis: Diese Zusammenfassung steuerrechtlicher Regeln ersetzt keine
 * Rechtsberatung; massgeblich sind die offiziellen Quellen.
 */

/** Minutenzaehler je Zuschlagsklasse; Nacht- und Tagesachse partitionieren je die Gesamtdauer. */
export interface SurchargeMinutes {
  /** Nacht 20:00-06:00 (25 %), ausserhalb des 40-%-Fensters. */
  night25Minutes: number;
  /** Nacht 00:00-04:00 (40 %) bei Arbeitsaufnahme vor 0 Uhr. */
  night40Minutes: number;
  /** Minuten ohne Nachtzuschlag (Vervollstaendigung der Nacht-Partition). */
  nightNoneMinutes: number;
  /** Sonntag (50 %) inkl. Fortwirkung 0-4 Uhr des Folgetags. */
  sunday50Minutes: number;
  /** Feiertag/31.12. ab 14:00 (125 %) inkl. Fortwirkung 0-4 Uhr. */
  holiday125Minutes: number;
  /** 24.12. ab 14:00, 25./26.12., 01.05. (150 %). */
  special150Minutes: number;
  /** Minuten ohne Tageszuschlag (Vervollstaendigung der Tages-Partition). */
  dayNoneMinutes: number;
}

const MINUTE_MS = 60_000;
/** Ende des 40-%-/Fortwirkungs-Fensters: 04:00 (Wanduhr-Minute, exklusiv). */
const CARRYOVER_END_MINUTE = 4 * 60;
/** Nachtfenster 20:00-06:00 (Wanduhr-Minuten). */
const NIGHT_START_MINUTE = 20 * 60;
const NIGHT_END_MINUTE = 6 * 60;
/** 24.12./31.12.: Zuschlag jeweils ab 14:00 (Wanduhr-Minute, inklusiv). */
const AFTERNOON_START_MINUTE = 14 * 60;

/** Tagesklassen in Konkurrenz-Reihenfolge: hoeherer Rang verdraengt (C-07). */
type DayClass = 'none' | 'sunday50' | 'holiday125' | 'special150';
const DAY_CLASS_RANK: Record<DayClass, number> = {
  none: 0,
  sunday50: 1,
  holiday125: 2,
  special150: 3,
};

function monthDay(isoDate: string): string {
  return isoDate.slice(5); // 'MM-DD'
}

/**
 * Tagesklasse eines lokalen Datums zu einer Wanduhr-Minute - OHNE Fortwirkung.
 * Konkurrenz: 150 % > 125 % > 50 % (C-05/C-07).
 */
function baseDayClass(
  isoDate: string,
  minuteOfDay: number,
  isHoliday: (isoDate: string) => boolean,
): DayClass {
  const md = monthDay(isoDate);
  if (md === '12-25' || md === '12-26' || md === '05-01') return 'special150';
  if (md === '12-24' && minuteOfDay >= AFTERNOON_START_MINUTE) return 'special150';
  if (isHoliday(isoDate)) return 'holiday125';
  if (md === '12-31' && minuteOfDay >= AFTERNOON_START_MINUTE) return 'holiday125';
  if (dayOfWeek(isoDate) === 0) return 'sunday50';
  return 'none';
}

/**
 * Klassifiziert jede gearbeitete Minute der Intervalle nach Paragraf 3b EStG.
 *
 * @param workIntervals Arbeitsintervalle (UTC-Instants, ohne Pausen).
 * @param shiftStartAt  Beginn der Schicht (Instant): entscheidet ueber das
 *                      40-%-Fenster und die 0-4-Uhr-Fortwirkung ("Arbeit vor
 *                      0 Uhr aufgenommen", C-02/C-03a/C-04a).
 * @param timeZone      IANA-Zeitzone des Einsatzortes (K-01).
 * @param isHoliday     Feiertagspruefung je lokalem Datum (einsatzortscharf, C-08).
 *
 * Invariante (K-04): night25+night40+nightNone == sunday50+holiday125+
 * special150+dayNone == Summe der Intervallminuten - jede Minute erhaelt genau
 * eine Nacht- und genau eine Tagesklasse.
 */
export function classifySurchargeMinutes(
  workIntervals: readonly Interval[],
  shiftStartAt: Date,
  timeZone: string,
  isHoliday: (isoDate: string) => boolean,
): SurchargeMinutes {
  const result: SurchargeMinutes = {
    night25Minutes: 0,
    night40Minutes: 0,
    nightNoneMinutes: 0,
    sunday50Minutes: 0,
    holiday125Minutes: 0,
    special150Minutes: 0,
    dayNoneMinutes: 0,
  };

  // Caches je lokalem Datum: Mitternachts-Instant und Fortwirkungs-Klasse.
  const dayStartMs = new Map<string, number>();
  const carryoverClass = new Map<string, DayClass>();
  const dayStartOf = (isoDate: string): number => {
    let ms = dayStartMs.get(isoDate);
    if (ms === undefined) {
      ms = localDayStart(isoDate, timeZone).getTime();
      dayStartMs.set(isoDate, ms);
    }
    return ms;
  };
  // Fortwirkung (C-03a/C-04a): Klasse des VORTAGS an seinem Tagesende (Minute
  // 23:59) wirkt bis 04:00 des Folgetags fort, wenn die Arbeit vor 0 Uhr
  // aufgenommen wurde. 24.12./31.12. sind um 23:59 bereits in ihrer
  // Nachmittagsklasse, deren Fortwirkung damit eingeschlossen.
  const carryoverOf = (isoDate: string): DayClass => {
    let cls = carryoverClass.get(isoDate);
    if (cls === undefined) {
      const prev = addIsoDays(isoDate, -1);
      cls = baseDayClass(prev, 23 * 60 + 59, isHoliday);
      carryoverClass.set(isoDate, cls);
    }
    return cls;
  };

  const shiftStartMs = shiftStartAt.getTime();

  for (const interval of workIntervals) {
    const minutes = intervalMinutes(interval);
    const startMs = interval.start.getTime();
    for (let i = 0; i < minutes; i += 1) {
      const instant = new Date(startMs + i * MINUTE_MS);
      const date = localDateOf(instant, timeZone);
      const minuteOfDay = localMinuteOfDay(instant, timeZone);
      // "Arbeit vor 0 Uhr aufgenommen": Schichtbeginn liegt vor der lokalen
      // Mitternacht DIESES Tages (C-02/C-03a/C-04a).
      const startedBeforeMidnight = shiftStartMs < dayStartOf(date);
      const inCarryoverWindow = minuteOfDay < CARRYOVER_END_MINUTE && startedBeforeMidnight;

      // Nacht-Partition: 40 % ersetzt 25 % im 0-4-Fenster (nie beide, C-07).
      if (inCarryoverWindow) {
        result.night40Minutes += 1;
      } else if (minuteOfDay >= NIGHT_START_MINUTE || minuteOfDay < NIGHT_END_MINUTE) {
        result.night25Minutes += 1;
      } else {
        result.nightNoneMinutes += 1;
      }

      // Tagesklasse: eigene Klasse des Tages, im Fortwirkungsfenster
      // uebersteuert vom Vortag, falls dessen Klasse hoeher ist (C-07:
      // Tagesklassen konkurrieren, nur der hoechste Satz gilt).
      let dayClass = baseDayClass(date, minuteOfDay, isHoliday);
      if (inCarryoverWindow) {
        const carried = carryoverOf(date);
        if (DAY_CLASS_RANK[carried] > DAY_CLASS_RANK[dayClass]) {
          dayClass = carried;
        }
      }
      if (dayClass === 'special150') result.special150Minutes += 1;
      else if (dayClass === 'holiday125') result.holiday125Minutes += 1;
      else if (dayClass === 'sunday50') result.sunday50Minutes += 1;
      else result.dayNoneMinutes += 1;
    }
  }

  return result;
}
