/**
 * Zuschlagsberechnung (C3). Nacht-, Sonntags- und Feiertagszuschläge werden als
 * deklaratives, VERSIONIERTES Regelpaket modelliert (ADR-0009) - analog zur
 * ArbZG-Engine. Die konkreten Sätze/Fenster sind konfigurierbar; das mitgelieferte
 * Basispaket orientiert sich an den steuerfreien Höchstsätzen nach § 3b EStG und
 * ersetzt keine Rechtsberatung. Tatsächliche Sätze folgen Tarifvertrag/
 * Betriebsvereinbarung und werden je Mandant gepflegt.
 */
export type SurchargeKind = 'night' | 'sunday' | 'holiday';

/** Zeitfenster in lokalen Minuten ab Mitternacht; bei start > end wird Mitternacht überschritten. */
export interface TimeWindow {
  startMinute: number;
  endMinute: number;
}

export interface SurchargeRule {
  kind: SurchargeKind;
  label: string;
  /** Zuschlagssatz in Prozent (z. B. 25 = 25 %). */
  ratePercent: number;
  /** Tageszeitfenster (nur für `night`). */
  window?: TimeWindow;
  /** Geforderte Tagesklassifikation (für `sunday`/`holiday`). */
  dayType?: 'sunday' | 'holiday';
}

/** Versioniertes Zuschlags-Regelpaket mit Gültigkeitszeitraum (ADR-0009). */
export interface SurchargeRulePackage {
  id: string;
  version: string;
  validFrom: string;
  validTo: string | null;
  description: string;
  rules: SurchargeRule[];
}

/**
 * Eine gearbeitete Spanne in LOKALER Zeit (zeitzonenunabhängig): Startdatum,
 * Startminute ab Mitternacht und Dauer. Überschreitet die Spanne Mitternacht,
 * wird das Folgedatum korrekt klassifiziert (Sonntag-/Feiertagswechsel).
 */
export interface WorkSpan {
  date: string;
  startMinute: number;
  durationMinutes: number;
}

export interface SurchargeResult {
  kind: SurchargeKind;
  label: string;
  ratePercent: number;
  /** Zuschlagspflichtige Minuten. */
  minutes: number;
}
