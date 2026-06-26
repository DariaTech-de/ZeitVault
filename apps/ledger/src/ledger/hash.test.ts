import { describe, expect, it } from 'vitest';
import { computeEventHash, stableStringify, type HashableEvent } from './hash';

const base: HashableEvent = {
  sequence: 1,
  tenantId: 't1',
  action: 'time_entry.create',
  actorId: 'user-1',
  subjectType: 'time_entry',
  subjectId: 'te-1',
  recordedAt: '2026-06-26T08:00:00.000Z',
  payload: { revision: 1 },
  prevHash: null,
};

describe('stableStringify', () => {
  it('serialisiert Objekte schluesselsortiert (reihenfolgeunabhaengig)', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });
});

describe('computeEventHash', () => {
  it('ist deterministisch', () => {
    expect(computeEventHash(base)).toBe(computeEventHash({ ...base }));
  });

  it('liefert einen 64-stelligen Hex-Hash (SHA-256)', () => {
    expect(computeEventHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('aendert sich bei abweichendem Inhalt', () => {
    expect(computeEventHash(base)).not.toBe(
      computeEventHash({ ...base, payload: { revision: 2 } }),
    );
  });

  it('aendert sich bei abweichendem prevHash', () => {
    expect(computeEventHash(base)).not.toBe(computeEventHash({ ...base, prevHash: 'abc' }));
  });
});
