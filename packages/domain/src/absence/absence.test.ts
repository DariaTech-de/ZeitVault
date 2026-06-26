import { describe, expect, it } from 'vitest';
import { isGermanHoliday } from '../calendar/holidays';
import { AbsenceTransitionError, nextAbsenceStatus } from './transitions';
import { countWorkingDays } from './working-days';

describe('nextAbsenceStatus', () => {
  it('Antrag kann genehmigt, abgelehnt oder storniert werden', () => {
    expect(nextAbsenceStatus('requested', 'approve')).toBe('approved');
    expect(nextAbsenceStatus('requested', 'reject')).toBe('rejected');
    expect(nextAbsenceStatus('requested', 'cancel')).toBe('cancelled');
  });
  it('genehmigter Antrag kann storniert werden', () => {
    expect(nextAbsenceStatus('approved', 'cancel')).toBe('cancelled');
  });
  it('terminale Zustaende lassen keine Aktion zu', () => {
    expect(() => nextAbsenceStatus('rejected', 'approve')).toThrow(AbsenceTransitionError);
    expect(() => nextAbsenceStatus('cancelled', 'cancel')).toThrow(AbsenceTransitionError);
    expect(() => nextAbsenceStatus('approved', 'approve')).toThrow(AbsenceTransitionError);
  });
});

describe('countWorkingDays', () => {
  it('Mo–Fr ohne Feiertage = 5', () => {
    // 2026-06-29 (Mo) .. 2026-07-03 (Fr)
    expect(countWorkingDays('2026-06-29', '2026-07-03', () => false)).toBe(5);
  });
  it('Wochenende zaehlt nicht', () => {
    // 2026-06-29 (Mo) .. 2026-07-05 (So)
    expect(countWorkingDays('2026-06-29', '2026-07-05', () => false)).toBe(5);
  });
  it('Feiertage werden abgezogen (NW, Fronleichnam 2026-06-04)', () => {
    // 2026-06-01 (Mo) .. 2026-06-05 (Fr); 2026-06-04 ist in NW Feiertag
    expect(countWorkingDays('2026-06-01', '2026-06-05', (iso) => isGermanHoliday(iso, 'NW'))).toBe(4);
  });
  it('ungueltiger Zeitraum = 0', () => {
    expect(countWorkingDays('2026-07-03', '2026-06-29', () => false)).toBe(0);
  });
});
