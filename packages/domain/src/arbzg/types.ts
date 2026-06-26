/** Ein gearbeitetes Zeitintervall (Arbeitszeit, ohne Pausen). */
export interface WorkInterval {
  start: Date;
  end: Date;
}

/** Eine Pause. */
export interface BreakInterval {
  start: Date;
  end: Date;
}

/**
 * Parameter eines ArbZG-Regelpakets. Alle Schwellen in Minuten, damit die
 * Bewertung rein numerisch und zeitzonenunabhaengig bleibt.
 */
export interface ArbZgRuleParams {
  /** Regulaere taegliche Hoechstarbeitszeit (Standard 8 h = 480 min). */
  maxDailyMinutesStandard: number;
  /** Ausgedehnte taegliche Hoechstarbeitszeit mit Ausgleich (10 h = 600 min). */
  maxDailyMinutesExtended: number;
  /** Mindestruhezeit zwischen zwei Arbeitseinsaetzen (11 h = 660 min). */
  minRestMinutes: number;
  /** Ab dieser Arbeitsdauer Pause der Stufe 1 erforderlich (6 h = 360 min). */
  breakThreshold1Minutes: number;
  /** Pflichtpause Stufe 1 (30 min). */
  breakMinutesTier1: number;
  /** Ab dieser Arbeitsdauer Pause der Stufe 2 erforderlich (9 h = 540 min). */
  breakThreshold2Minutes: number;
  /** Pflichtpause Stufe 2 (45 min). */
  breakMinutesTier2: number;
}

/**
 * Versioniertes Regelpaket mit Gueltigkeitszeitraum. Gesetzesaenderungen werden
 * als neues, datiertes Paket eingepflegt (ADR-0009, ARCHITEKTUR.md Paragraf 10).
 */
export interface RulePackage {
  id: string;
  version: string;
  /** Gueltig ab (ISO-Datum YYYY-MM-DD, inklusiv). */
  validFrom: string;
  /** Gueltig bis (ISO-Datum, inklusiv) oder null fuer offen. */
  validTo: string | null;
  params: ArbZgRuleParams;
}

export type FindingSeverity = 'warning' | 'violation';

export type FindingCode =
  | 'MAX_DAILY_WORKTIME_EXCEEDED'
  | 'MAX_DAILY_WORKTIME_EXTENDED_EXCEEDED'
  | 'REST_PERIOD_TOO_SHORT'
  | 'BREAK_MISSING'
  | 'BREAK_TOO_SHORT';

/** Ein Bewertungsbefund (Warnung oder Verstoss). */
export interface Finding {
  code: FindingCode;
  severity: FindingSeverity;
  message: string;
  /** Numerische Kontextwerte fuer Reporting/Verstossprotokoll. */
  details: Record<string, number>;
}

/** Eingabe fuer die Bewertung eines Arbeitstags. */
export interface WorkDayInput {
  /** Kalendertag (ISO YYYY-MM-DD). */
  date: string;
  intervals: WorkInterval[];
  breaks: BreakInterval[];
  /** Ende des letzten Arbeitseinsatzes am Vortag (fuer Ruhezeit) oder null. */
  previousShiftEnd: Date | null;
}
