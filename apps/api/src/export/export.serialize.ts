import { createHash } from 'node:crypto';

/**
 * Deterministische, reproduzierbare Serialisierung der GoBD-relevanten
 * Stempel-Rohdaten. Feste Spaltenreihenfolge und stabile Sortierung stellen
 * sicher, dass identische Daten denselben Inhalt und dieselbe Prüfsumme ergeben.
 */
export const GOBD_COLUMNS = [
  'tenant_id',
  'employee_id',
  'event_id',
  'kind',
  'occurred_at',
  'source',
  'corrects_event_id',
  'correction_reason',
  'client_event_id',
  'created_at',
] as const;

export type GobdColumn = (typeof GOBD_COLUMNS)[number];
export type GobdRecord = Record<GobdColumn, string | null>;

function csvCell(value: string | null): string {
  if (value === null) return '';
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** CSV (RFC-4180-nah, LF, UTF-8) mit fester Kopfzeile. */
export function toCsv(records: readonly GobdRecord[]): string {
  const header = GOBD_COLUMNS.join(',');
  const lines = records.map((record) => GOBD_COLUMNS.map((col) => csvCell(record[col])).join(','));
  return [header, ...lines].join('\n') + '\n';
}

/** JSON-Array mit fester Schlüsselreihenfolge. */
export function toJson(records: readonly GobdRecord[]): string {
  const ordered = records.map((record) => {
    const out: Record<string, string | null> = {};
    for (const col of GOBD_COLUMNS) out[col] = record[col];
    return out;
  });
  return JSON.stringify(ordered, null, 2) + '\n';
}

export function serializeGobd(records: readonly GobdRecord[], format: 'csv' | 'json'): string {
  return format === 'json' ? toJson(records) : toCsv(records);
}

/** SHA-256 (hex) über den exportierten Inhalt. */
export function checksum(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
