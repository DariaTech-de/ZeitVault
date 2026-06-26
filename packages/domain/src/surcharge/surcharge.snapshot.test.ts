import { describe, expect, it } from 'vitest';
import { isGermanHoliday } from '../calendar/holidays';
import { computeSurcharges } from './compute';
import { ZUSCHLAEGE_BASIS_2026_V1 } from './rule-packages';
import type { SurchargeContext, WorkSpan } from './types';

const NW: SurchargeContext = { isHoliday: (iso) => isGermanHoliday(iso, 'NW') };

/**
 * Snapshot-Tests gegen reale Szenarien. Ändert sich die Zuschlagslogik oder das
 * Basispaket, schlagen diese Tests an und der Reviewer entscheidet bewusst über
 * die Aktualisierung des Snapshots (CLAUDE.md §6).
 */
describe('computeSurcharges – Snapshots realer Schichten (NW, 2026)', () => {
  const scenarios: Array<{ name: string; spans: WorkSpan[] }> = [
    {
      name: 'Dreischicht-Woche: Früh/Spät/Nacht Mo–Mi',
      spans: [
        { date: '2026-06-29', startMinute: 6 * 60, durationMinutes: 480 }, // Mo Früh 06–14
        { date: '2026-06-30', startMinute: 14 * 60, durationMinutes: 480 }, // Di Spät 14–22
        { date: '2026-07-01', startMinute: 22 * 60, durationMinutes: 480 }, // Mi Nacht 22–06
      ],
    },
    {
      name: 'Wochenend-Nachtdienst: Sa 22:00 – So 06:00 und So 22:00 – Mo 06:00',
      spans: [
        { date: '2026-07-04', startMinute: 22 * 60, durationMinutes: 480 }, // Sa→So
        { date: '2026-07-05', startMinute: 22 * 60, durationMinutes: 480 }, // So→Mo
      ],
    },
    {
      name: 'Feiertagsdienst Neujahr 2026-01-01 (Do) 20:00 – 04:00',
      spans: [{ date: '2026-01-01', startMinute: 20 * 60, durationMinutes: 480 }],
    },
  ];

  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const result = computeSurcharges(scenario.spans, ZUSCHLAEGE_BASIS_2026_V1, NW);
      expect(result).toMatchSnapshot();
    });
  }
});
