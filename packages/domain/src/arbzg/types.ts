import type { StampRoundingMode } from '../stamping/rounding';

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
  /**
   * Schwelle Stufe 1 (6 h = 360 min). § 4 Satz 1 ArbZG: Pause erst bei MEHR
   * ALS dieser Arbeitszeit erforderlich (strikt groesser, B-02).
   */
  breakThreshold1Minutes: number;
  /** Pflichtpause Stufe 1 (30 min). */
  breakMinutesTier1: number;
  /**
   * Schwelle Stufe 2 (9 h = 540 min). § 4 Satz 1: 45 min erst bei MEHR ALS
   * neun Stunden; genau 9:00 h gehoert noch zu "bis zu neun Stunden" (30 min).
   */
  breakThreshold2Minutes: number;
  /** Pflichtpause Stufe 2 (45 min). */
  breakMinutesTier2: number;
  /**
   * § 4 Satz 2 ArbZG: Ruhepausen koennen in Abschnitte von JEWEILS mindestens
   * dieser Laenge aufgeteilt werden (15 min); kuerzere Abschnitte zaehlen nicht.
   */
  breakMinSegmentMinutes: number;
  /**
   * § 4 Satz 3 ArbZG: laenger als diese Zeit (6 h = 360 min) darf nicht
   * HINTEREINANDER ohne Ruhepause gearbeitet werden.
   */
  maxContinuousWorkMinutes: number;
  /**
   * ArbZG-Nachtzeit § 2 Abs. 3, Beginn (Wanduhr-Minute; 23:00 = 1380).
   * Baeckereien/Konditoreien: 22:00 - Abweichung nur per TV-/BV-Regelsatz.
   * NICHT das EStG-Zuschlagsfenster (B-05, night.ts).
   */
  arbzgNightStartMinute: number;
  /** ArbZG-Nachtzeit, Ende (exklusiv; 06:00 = 360; Baecker 05:00). */
  arbzgNightEndMinute: number;
  /**
   * Woechentliche Hoechstarbeitszeit (B-11; 48 h = 2880 min). Wird immer
   * berechnet; Befunde erzeugt sie nur im Modus 'weekly'.
   */
  maxWeeklyMinutes: number;
  /**
   * Massstab der Hoechstarbeitszeit (B-11, Rechtsstand-Abschnitt): 'daily'
   * (heutiges ArbZG) oder 'weekly' (nur tarifgebunden, per gruppen-gescoptem
   * Regelsatz umschaltbar).
   */
  maxWorkingTimeMode: 'daily' | 'weekly';
  /**
   * Rundung der Stempelzeit je Ereignisart (B-12): setzt am EREIGNIS beim
   * Eintragen an, nie je Intervall/Zeitscheibe. Standard IMMER 'none';
   * jede Abweichung ist mitbestimmungspflichtig (BV-Referenz, § 87 Abs. 1
   * Nr. 2 BetrVG) und durch den Regelsatz dokumentiert/auditiert.
   */
  roundingClockIn: StampRoundingMode;
  roundingBreakStart: StampRoundingMode;
  roundingBreakEnd: StampRoundingMode;
  roundingClockOut: StampRoundingMode;
  /**
   * Kulanzfrist (ADR-0019): Solange das letzte Ereignis einer nicht beendeten
   * Schicht juenger ist, gilt sie als 'open'; danach als 'unresolved'.
   * Regelschicht-Parameter (B-08): Abweichungen sind mitbestimmungspflichtig
   * (Paragraf 87 Abs. 1 Nr. 2 BetrVG) und erfordern eine TV-/BV-Referenz.
   */
  openShiftGraceMinutes: number;
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
  | 'REST_PERIOD_UNVERIFIABLE'
  | 'BREAK_MISSING'
  | 'BREAK_TOO_SHORT'
  | 'CONTINUOUS_WORK_EXCEEDED'
  | 'MAX_WEEKLY_WORKTIME_EXCEEDED'
  | 'SHIFT_UNRESOLVED';

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
  /**
   * previousShiftEnd ist nur eine UNTERGRENZE (Vorschicht unaufgeloest,
   * ADR-0019): Die Ruhezeit ist dann hoechstens die gemessene - ein Verstoss
   * bleibt sicher, Einhaltung ist nicht pruefbar.
   */
  previousShiftEndIsLowerBound?: boolean;
}
