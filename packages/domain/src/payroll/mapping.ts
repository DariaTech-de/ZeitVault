import type { DatevMapping, PayrollAggregate, PayrollCategory, PayrollLineItem } from './types';

export interface MappingResult {
  items: PayrollLineItem[];
  /** Kategorien ohne Mapping-Eintrag (mit Restwert), die NICHT exportiert wurden. */
  unmapped: Array<{ category: PayrollCategory; value: number }>;
}

/**
 * Wendet die Mapping-Tabelle auf die Aggregate an. Kategorien ohne Eintrag werden
 * NICHT stillschweigend exportiert, sondern als `unmapped` zurückgegeben, damit
 * fehlende Zuordnungen sichtbar bleiben (keine stillen Lücken in der Abrechnung).
 */
export function mapToLineItems(
  aggregates: readonly PayrollAggregate[],
  mapping: DatevMapping,
): MappingResult {
  const items: PayrollLineItem[] = [];
  const unmapped: Array<{ category: PayrollCategory; value: number }> = [];

  for (const aggregate of aggregates) {
    const entry = mapping[aggregate.category];
    if (!entry) {
      if (aggregate.value !== 0) {
        unmapped.push({ category: aggregate.category, value: aggregate.value });
      }
      continue;
    }
    items.push({
      personnelNumber: aggregate.personnelNumber,
      category: aggregate.category,
      lohnart: entry.lohnart,
      kostenstelle: entry.kostenstelle ?? null,
      ausfallschluessel: entry.ausfallschluessel ?? null,
      value: aggregate.value,
      unit: aggregate.unit,
      factorPercent: entry.factorPercent ?? null,
    });
  }

  return { items, unmapped };
}

const COLUMNS = [
  'personnel_number',
  'category',
  'lohnart',
  'kostenstelle',
  'ausfallschluessel',
  'value',
  'unit',
  'factor_percent',
] as const;

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Generischer, neutraler CSV-Export der Lohnzeilen (feste Spalten, LF, UTF-8).
 * Dies ist KEIN DATEV-Datensatzformat, sondern ein neutrales Interchange-CSV
 * (siehe types.ts / CLAUDE.md §9).
 */
export function toPayrollCsv(items: readonly PayrollLineItem[]): string {
  const header = COLUMNS.join(',');
  const lines = items.map((i) =>
    [
      csvCell(i.personnelNumber),
      csvCell(i.category),
      csvCell(i.lohnart),
      csvCell(i.kostenstelle),
      csvCell(i.ausfallschluessel),
      csvCell(i.value),
      csvCell(i.unit),
      csvCell(i.factorPercent),
    ].join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}
