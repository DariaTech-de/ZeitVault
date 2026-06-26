import { describe, expect, it } from 'vitest';
import { deletionDueDate, isDeletionDue, pseudonymize } from './retention';

describe('deletionDueDate', () => {
  it('GoBD: 10 Jahre auf den Jahresletzten', () => {
    expect(deletionDueDate('2026-06-26', 'gobd_10y')).toBe('2036-12-31');
  });
  it('Lohn: 6 Jahre', () => {
    expect(deletionDueDate('2026-01-01', 'payroll_6y')).toBe('2032-12-31');
  });
  it('DSGVO allgemein: keine Aufbewahrungsfrist (Ende des Referenzjahres)', () => {
    expect(deletionDueDate('2026-03-15', 'dsgvo_general')).toBe('2026-12-31');
  });
});

describe('isDeletionDue', () => {
  it('Stichtag erreicht/überschritten -> faellig', () => {
    expect(isDeletionDue('2036-12-31', '2036-12-31')).toBe(true);
    expect(isDeletionDue('2037-01-01', '2036-12-31')).toBe(true);
  });
  it('vor Stichtag -> nicht faellig', () => {
    expect(isDeletionDue('2030-01-01', '2036-12-31')).toBe(false);
  });
});

describe('pseudonymize', () => {
  it('ist deterministisch und entfernt Klarnamen/Personalnummer', () => {
    const a = pseudonymize('a11dfbf3-0e2b-411c-85f0-9f16f1f0b068');
    const b = pseudonymize('a11dfbf3-0e2b-411c-85f0-9f16f1f0b068');
    expect(a).toEqual(b);
    expect(a.displayName).toBe('Gesperrt (A11DFBF3)');
    expect(a.personnelNumber).toBe('ANON-A11DFBF3');
  });
});
