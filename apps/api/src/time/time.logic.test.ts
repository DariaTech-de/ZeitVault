import { describe, expect, it } from 'vitest';
import { buildCorrectionEntry } from './time.logic';

describe('buildCorrectionEntry', () => {
  it('erhoeht die Revision und verweist auf den Vorgaenger, ohne ihn zu veraendern', () => {
    const next = buildCorrectionEntry(
      { id: 'prev-id', tenantId: 't1', employeeId: 'e1', source: 'web', revision: 1 },
      {
        startAt: new Date('2026-06-26T08:00:00Z'),
        endAt: new Date('2026-06-26T16:00:00Z'),
        correctionReason: 'Tippfehler beim Ende',
      },
    );

    expect(next.revision).toBe(2);
    expect(next.previousEntryId).toBe('prev-id');
    expect(next.correctionReason).toBe('Tippfehler beim Ende');
    expect(next.status).toBe('corrected');
    expect(next.tenantId).toBe('t1');
    expect(next.employeeId).toBe('e1');
    expect(next.source).toBe('web');
  });
});
