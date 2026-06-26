import type { SurchargeRulePackage } from './types';

/**
 * Basis-Zuschlagspaket (Stand 2026). Die Sätze orientieren sich an den
 * steuerfreien Höchstsätzen nach § 3b EStG (Nachtarbeit 20:00–06:00: 25 %,
 * Sonntag: 50 %, Feiertag: 125 %) und dienen als konfigurierbarer Ausgangswert.
 *
 * Hinweis: Diese Zusammenfassung ersetzt keine Rechtsberatung; die tatsächlich
 * zu zahlenden Zuschläge ergeben sich aus Tarifvertrag/Betriebsvereinbarung und
 * werden je Mandant als eigenes, datiertes Regelpaket gepflegt (ADR-0009).
 */
export const ZUSCHLAEGE_BASIS_2026_V1: SurchargeRulePackage = {
  id: 'zuschlaege.de',
  version: '2026.1',
  validFrom: '2026-01-01',
  validTo: null,
  description: 'Basis-Zuschlagssätze orientiert an § 3b EStG (Nacht 25 %, Sonntag 50 %, Feiertag 125 %).',
  rules: [
    {
      kind: 'night',
      label: 'Nachtzuschlag',
      ratePercent: 25,
      // 20:00 (1200) bis 06:00 (360) des Folgetags.
      window: { startMinute: 20 * 60, endMinute: 6 * 60 },
    },
    {
      kind: 'sunday',
      label: 'Sonntagszuschlag',
      ratePercent: 50,
      dayType: 'sunday',
    },
    {
      kind: 'holiday',
      label: 'Feiertagszuschlag',
      ratePercent: 125,
      dayType: 'holiday',
    },
  ],
};

export const DEFAULT_SURCHARGE_PACKAGES: readonly SurchargeRulePackage[] = [ZUSCHLAEGE_BASIS_2026_V1];
