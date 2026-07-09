/**
 * Lohn-Mapping-Gerüst (D3). ZeitVault aggregiert interne Kategorien (Arbeitszeit,
 * Abwesenheiten) und bildet sie über eine KONFIGURIERBARE Mapping-Tabelle auf
 * lohnabrechnungsrelevante Schlüssel ab (Lohnart, Kostenstelle, Ausfallschlüssel).
 *
 * WICHTIG: Die konkreten DATEV-Feldlayouts/Datensatzformate werden hier bewusst
 * NICHT erfunden (CLAUDE.md §9). Maßgeblich ist ausschließlich die offizielle
 * DATEV-Schnittstellenbeschreibung; bis diese vorliegt, erzeugt ZeitVault nur
 * einen GENERISCHEN, neutralen CSV-Export. Die Schlüssel (lohnart usw.) sind
 * mandantenseitig gepflegte Codes, keine von ZeitVault vorgegebenen Layouts.
 */
/**
 * Interne Abrechnungskategorien. C-09: Jede Bewertungsart hat ihre EIGENE
 * Kategorie und damit ihre eigene Lohnart (und optional einen eigenen
 * Verguetungsfaktor) im Mapping: 'work_time' = Vollarbeit, 'on_call_duty' =
 * Bereitschaftsdienst, 'standby' = Rufbereitschaft, 'travel' = Reisezeit.
 */
export type PayrollCategory =
  | 'work_time'
  | 'on_call_duty'
  | 'standby'
  | 'travel'
  | 'vacation'
  | 'sick'
  | 'special';

export const PAYROLL_CATEGORIES: readonly PayrollCategory[] = [
  'work_time',
  'on_call_duty',
  'standby',
  'travel',
  'vacation',
  'sick',
  'special',
];

/** Mandantenseitig konfigurierte Zuordnung einer internen Kategorie. */
export interface DatevMappingEntry {
  lohnart: string;
  kostenstelle?: string;
  ausfallschluessel?: string;
}

/** Mapping-Tabelle: interne Kategorie -> Abrechnungsschlüssel. */
export type DatevMapping = Partial<Record<PayrollCategory, DatevMappingEntry>>;

/** Aggregierter Wert je Mitarbeitenden und Kategorie für einen Zeitraum. */
export interface PayrollAggregate {
  personnelNumber: string;
  category: PayrollCategory;
  value: number;
  unit: 'minutes' | 'days';
}

/** Generische, abrechnungsfertige Zeile (neutral, NICHT DATEV-Datensatzformat). */
export interface PayrollLineItem {
  personnelNumber: string;
  category: PayrollCategory;
  lohnart: string;
  kostenstelle: string | null;
  ausfallschluessel: string | null;
  value: number;
  unit: 'minutes' | 'days';
}
