/**
 * Lokale Zeitrechnung (K-01/K-06, ADR-0016/0018): Zeitstempel werden in UTC
 * gespeichert; BEWERTET wird gegen die IANA-Zeitzone des Einsatzortes. Dieses
 * Modul ist die einzige Stelle, die Instant -> lokaler Kalendertag uebersetzt
 * (DST-korrekt ueber Intl, ohne externe Bibliothek).
 */

export interface Interval {
  start: Date;
  end: Date;
}

/** Ein an lokalen Tagesgrenzen geteiltes Stueck eines Intervalls. */
export interface LocalDaySlice {
  /** Lokaler Kalendertag (YYYY-MM-DD). */
  date: string;
  /** Wanduhr-Minute des Slice-Beginns (Minuten seit lokaler Mitternacht). */
  startMinute: number;
  /** TATSAECHLICH verstrichene Minuten (DST-korrekt; ganze Minuten). */
  minutes: number;
}

const MINUTE_MS = 60_000;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Wirft bei ungueltiger IANA-Zeitzone (validiert beim Anlegen von Einsatzorten). */
export function assertValidTimeZone(timeZone: string): void {
  try {
    formatter(timeZone);
  } catch {
    throw new Error(`Ungueltige IANA-Zeitzone: '${timeZone}'.`);
  }
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallParts(instant: Date, timeZone: string): WallParts {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((p) => p.type === type)?.value ?? '0';
    return Number(value);
  };
  // Intl liefert fuer 00 Uhr je nach ICU '24' - normalisieren.
  const rawHour = get('hour');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset der Zone gegenueber UTC in Minuten zum gegebenen Instant. */
export function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const p = wallParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - instant.getTime()) / MINUTE_MS);
}

/** Lokaler Kalendertag (YYYY-MM-DD) eines Instants. */
export function localDateOf(instant: Date, timeZone: string): string {
  const p = wallParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Wanduhr-Minuten seit lokaler Mitternacht eines Instants. */
export function localMinuteOfDay(instant: Date, timeZone: string): number {
  const p = wallParts(instant, timeZone);
  return p.hour * 60 + p.minute;
}

/** Addiert Tage auf ein ISO-Datum (reine Kalenderarithmetik, tz-frei). */
export function addIsoDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  base.setUTCDate(base.getUTCDate() + delta);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Lokale Wanduhrzeit existiert nicht (Fruehjahrs-Umstellungsluecke). */
export class NonexistentLocalTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonexistentLocalTimeError';
  }
}

/** Lokale Wanduhrzeit existiert zweimal (Herbst-Umstellung); Aufloesung noetig. */
export class AmbiguousLocalTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousLocalTimeError';
  }
}

export type AmbiguousResolution = 'earlier' | 'later';

/**
 * Uebersetzt eine lokale Wanduhrzeit (Datum + 'HH:mm'[':ss']) in einen
 * eindeutigen Instant (K-01). Server-Schnittstellen nehmen ausschliesslich
 * Instants mit Offset an (isoTimestampSchema); diese Funktion ist die EINZIGE
 * zulaessige Uebersetzung fuer Wanduhr-Eingaben (Formulare, Antraege):
 *
 * - Nicht existente Zeiten (Fruehjahrsluecke, z. B. 29.03.2026 02:30
 *   Europe/Berlin) werfen NonexistentLocalTimeError - die Eingabe ist falsch
 *   und muss korrigiert werden, nicht still verschoben.
 * - Doppelte Zeiten (Herbst, z. B. 25.10.2026 02:30) verlangen eine EXPLIZITE
 *   Aufloesung ('earlier' = Sommerzeit-Instant, 'later' = Winterzeit-Instant);
 *   ohne sie wird AmbiguousLocalTimeError geworfen. Kein stiller Default.
 */
export function instantFromLocal(
  isoDate: string,
  wallTime: string,
  timeZone: string,
  resolution?: AmbiguousResolution,
): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wallTime);
  if (!dateMatch || !timeMatch) {
    throw new Error(`Ungueltige lokale Zeitangabe: '${isoDate} ${wallTime}'.`);
  }
  const [, y, m, d] = dateMatch;
  const [, hh, mm, ss] = timeMatch;
  const hour = Number(hh);
  const minute = Number(mm);
  const second = Number(ss ?? '0');
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Ungueltige lokale Zeitangabe: '${isoDate} ${wallTime}'.`);
  }
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d), hour, minute, second);

  // Kandidaten ueber alle in der Umgebung vorkommenden Offsets; ein Kandidat
  // ist gueltig, wenn seine Wanduhrzeit exakt der Eingabe entspricht.
  const offsets = new Set([
    tzOffsetMinutes(new Date(guess - 24 * 60 * MINUTE_MS), timeZone),
    tzOffsetMinutes(new Date(guess), timeZone),
    tzOffsetMinutes(new Date(guess + 24 * 60 * MINUTE_MS), timeZone),
  ]);
  const matches: number[] = [];
  for (const offset of offsets) {
    const candidate = guess - offset * MINUTE_MS;
    const p = wallParts(new Date(candidate), timeZone);
    const roundtrip = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (roundtrip === guess && !matches.includes(candidate)) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) {
    throw new NonexistentLocalTimeError(
      `Die lokale Zeit ${isoDate} ${wallTime} existiert in '${timeZone}' nicht ` +
        '(Zeitumstellung). Bitte eine existierende Uhrzeit angeben.',
    );
  }
  if (matches.length === 1) {
    return new Date(matches[0]!);
  }
  if (!resolution) {
    throw new AmbiguousLocalTimeError(
      `Die lokale Zeit ${isoDate} ${wallTime} existiert in '${timeZone}' zweimal ` +
        "(Zeitumstellung). Aufloesung 'earlier' oder 'later' ist erforderlich.",
    );
  }
  matches.sort((a, b) => a - b);
  return new Date(resolution === 'earlier' ? matches[0]! : matches[matches.length - 1]!);
}

/**
 * UTC-Instant der lokalen Mitternacht eines Kalendertags. Zwei-Pass ueber den
 * Offset plus Verifikation; faellt die Mitternacht in eine (in Europa nicht
 * vorkommende) Umstellungsluecke, wird der erste existierende Instant des Tages
 * geliefert.
 */
export function localDayStart(isoDate: string, timeZone: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!);
  let candidate = guess - tzOffsetMinutes(new Date(guess), timeZone) * MINUTE_MS;
  const offset2 = tzOffsetMinutes(new Date(candidate), timeZone);
  candidate = guess - offset2 * MINUTE_MS;
  // Verifikation/Korrektur in 15-min-Schritten (begrenzte Schleife).
  for (let i = 0; i < 96 && localDateOf(new Date(candidate), timeZone) < isoDate; i += 1) {
    candidate += 15 * MINUTE_MS;
  }
  for (let i = 0; i < 96 && localDateOf(new Date(candidate - 1), timeZone) >= isoDate; i += 1) {
    candidate -= 15 * MINUTE_MS;
  }
  return new Date(candidate);
}

/**
 * Teilt ein UTC-Intervall an lokalen Tagesgrenzen (kalendertaegliche Lesart,
 * K-03; Grundlage der Zuschlags-Splittung K-04). `minutes` je Slice sind
 * TATSAECHLICH verstrichene Minuten - ueber eine DST-Umstellung hinweg ergibt
 * die Summe daher 7 h bzw. 9 h statt 8 h (K-01).
 *
 * Summeninvariante (B-12): Sum(Slice-Minuten) == intervalMinutes(interval),
 * fuer beliebige sekundengenaue Stempel. Dafuer werden die Minuten aus
 * gerundeten KUMULIERTEN Grenzen abgeleitet (round(bis Grenze) - round(bis
 * Vorgrenze)); die Gesamtdauer wird also genau EINMAL gerundet, die Splittung
 * selbst traegt keine eigene Rundung bei. Je Scheibe einzeln zu runden waere
 * eine systematische, mit Nachtarbeit korrelierende Rundung (Tagesgrenzen und
 * spaeter Paragraf-3b-Fenster erzeugen die Zwischengrenzen).
 *
 * Hinweis fuer Verbraucher: `startMinute + i` ist NICHT als Wanduhrzeit
 * fortschreibbar, wenn innerhalb des Slices eine Umstellung liegt;
 * Zuschlags-Fensterpruefungen klassifizieren je Instant (Schnitt 4).
 */
export function sliceIntervalByLocalDay(interval: Interval, timeZone: string): LocalDaySlice[] {
  const startMs = interval.start.getTime();
  const endMs = interval.end.getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    throw new Error('Ungueltiges Intervall: Ende liegt vor Beginn oder Datum ungueltig.');
  }
  const slices: LocalDaySlice[] = [];
  let cursor = startMs;
  // Bereits vergebene Minuten (gerundete kumulierte Grenze bis zum Cursor).
  let allocated = 0;
  // Begrenzung: ein Intervall ueberspannt praktisch nie > 62 Tage.
  for (let i = 0; i < 62 && cursor < endMs; i += 1) {
    const cursorDate = new Date(cursor);
    const date = localDateOf(cursorDate, timeZone);
    const nextMidnight = localDayStart(addIsoDays(date, 1), timeZone).getTime();
    const sliceEnd = Math.min(endMs, nextMidnight);
    const cumulative = Math.round((sliceEnd - startMs) / MINUTE_MS);
    slices.push({
      date,
      startMinute: localMinuteOfDay(cursorDate, timeZone),
      minutes: cumulative - allocated,
    });
    allocated = cumulative;
    cursor = sliceEnd;
  }
  return slices;
}
