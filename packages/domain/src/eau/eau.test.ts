import { describe, expect, it } from 'vitest';
import { EauTransitionError, nextEauStatus } from './eau';

describe('nextEauStatus', () => {
  it('durchläuft den regulären Fluss requested -> submitted -> confirmed', () => {
    expect(nextEauStatus('requested', 'submit')).toBe('submitted');
    expect(nextEauStatus('submitted', 'confirm')).toBe('confirmed');
  });
  it('Fehler kann erneut versucht werden', () => {
    expect(nextEauStatus('submitted', 'fail')).toBe('failed');
    expect(nextEauStatus('failed', 'retry')).toBe('submitted');
  });
  it('unzulässige Übergänge werfen', () => {
    expect(() => nextEauStatus('confirmed', 'submit')).toThrow(EauTransitionError);
    expect(() => nextEauStatus('requested', 'confirm')).toThrow(EauTransitionError);
  });
});
