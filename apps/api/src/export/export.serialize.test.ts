import { describe, expect, it } from 'vitest';
import { type GobdRecord, checksum, serializeGobd, toCsv } from './export.serialize';

const records: GobdRecord[] = [
  {
    tenant_id: 'default',
    employee_id: 'e1',
    event_id: 'ev1',
    kind: 'clock_in',
    occurred_at: '2026-06-22T08:00:00.000Z',
    source: 'web',
    corrects_event_id: null,
    correction_reason: null,
    client_event_id: null,
    created_at: '2026-06-22T08:00:00.500Z',
  },
  {
    tenant_id: 'default',
    employee_id: 'e1',
    event_id: 'ev2',
    kind: 'clock_out',
    occurred_at: '2026-06-22T16:30:00.000Z',
    source: 'web',
    corrects_event_id: null,
    correction_reason: 'Korrektur, mit "Komma"',
    client_event_id: null,
    created_at: '2026-06-22T16:30:00.500Z',
  },
];

describe('serializeGobd', () => {
  it('CSV beginnt mit fester Kopfzeile und maskiert Sonderzeichen', () => {
    const csv = toCsv(records);
    expect(csv.split('\n')[0]).toBe(
      'tenant_id,employee_id,event_id,kind,occurred_at,source,corrects_event_id,correction_reason,client_event_id,created_at',
    );
    expect(csv).toContain('"Korrektur, mit ""Komma"""');
  });

  it('ist reproduzierbar: gleicher Inhalt -> gleiche Prüfsumme', () => {
    expect(checksum(serializeGobd(records, 'csv'))).toBe(checksum(serializeGobd(records, 'csv')));
    expect(checksum(serializeGobd(records, 'json'))).toBe(checksum(serializeGobd(records, 'json')));
  });

  it('unterschiedliche Inhalte -> unterschiedliche Prüfsumme', () => {
    const csv = checksum(serializeGobd(records, 'csv'));
    const json = checksum(serializeGobd(records, 'json'));
    expect(csv).not.toBe(json);
    expect(checksum(serializeGobd([records[0]!], 'csv'))).not.toBe(csv);
  });
});
