import { describe, expect, it } from 'vitest';
import { holidaysForLocation, isHolidayAtLocation } from './holidays';

// C-08: Feiertagskalender pro Bundesland und pro EINSATZORT - nicht pro
// Mandant. Gemeindespezifische Feiertage (Fronleichnam in Teilen von SN/TH,
// Mariae Himmelfahrt in Teilen von BY, Augsburger Friedensfest) werden als
// explizite Schluessel am Einsatzort gepflegt - keine erfundene AGS-Liste.
//
// Fronleichnam 2026: Ostersonntag 05.04. + 60 Tage = 04.06.2026.
const FRONLEICHNAM_2026 = '2026-06-04';

describe('C-08: Feiertag haengt am Einsatzort (Bundesland), nicht am Mandanten', () => {
  it('AK: Einsatzort Bayern am Fronleichnam -> Feiertag', () => {
    expect(isHolidayAtLocation(FRONLEICHNAM_2026, { stateCode: 'BY' })).toBe(true);
  });

  it('derselbe Mandant, Einsatzort Sachsen ohne Gemeinde-Schluessel -> kein Feiertag', () => {
    expect(isHolidayAtLocation(FRONLEICHNAM_2026, { stateCode: 'SN' })).toBe(false);
  });

  it('Hessen: Fronleichnam ist LANDESWEIT gesetzlicher Feiertag (der Spec-AK nennt HE irrig als Gegenbeispiel; gemeldet)', () => {
    expect(isHolidayAtLocation(FRONLEICHNAM_2026, { stateCode: 'HE' })).toBe(true);
  });

  it('ohne Bundesland keine Feiertagsbewertung (Feiertagsrecht ist Landesrecht)', () => {
    expect(isHolidayAtLocation(FRONLEICHNAM_2026, { stateCode: null })).toBe(false);
    expect(holidaysForLocation(2026, { stateCode: null })).toEqual([]);
  });
});

describe('C-08: Gemeinde-Ausnahmen als explizite Schluessel am Einsatzort', () => {
  it('SN mit Schluessel fronleichnam (katholisch-sorbisches Gebiet) -> Feiertag', () => {
    expect(
      isHolidayAtLocation(FRONLEICHNAM_2026, {
        stateCode: 'SN',
        municipalHolidayKeys: ['fronleichnam'],
      }),
    ).toBe(true);
  });

  it('Augsburger Friedensfest (08.08.) nur mit Schluessel, nicht in ganz BY', () => {
    expect(isHolidayAtLocation('2026-08-08', { stateCode: 'BY' })).toBe(false);
    expect(
      isHolidayAtLocation('2026-08-08', { stateCode: 'BY', municipalHolidayKeys: ['friedensfest'] }),
    ).toBe(true);
  });

  it('Mariae Himmelfahrt (15.08.): in BY nur mit Schluessel, im SL landesweit', () => {
    expect(isHolidayAtLocation('2026-08-15', { stateCode: 'BY' })).toBe(false);
    expect(
      isHolidayAtLocation('2026-08-15', {
        stateCode: 'BY',
        municipalHolidayKeys: ['mariae_himmelfahrt'],
      }),
    ).toBe(true);
    expect(isHolidayAtLocation('2026-08-15', { stateCode: 'SL' })).toBe(true);
  });

  it('Schluessel dupliziert keinen bereits landesweiten Feiertag', () => {
    const list = holidaysForLocation(2026, {
      stateCode: 'BY',
      municipalHolidayKeys: ['fronleichnam'],
    });
    expect(list.filter((h) => h.date === FRONLEICHNAM_2026)).toHaveLength(1);
  });
});
