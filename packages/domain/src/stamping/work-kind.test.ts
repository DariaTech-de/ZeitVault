import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_PACKAGES, selectRulePackage } from '../arbzg/rule-packages';
import { buildAccountingDays } from './day-view';
import { foldShifts } from './shifts';
import type { StampEvent } from './types';

// C-09: Getrennte Bewertungsarten - Vollarbeit, Bereitschaftsdienst,
// Rufbereitschaft, Reisezeit. ArbZG-Behandlung laut AK: Bereitschaftsdienst =
// ARBEITSZEIT, Rufbereitschaft = RUHEZEIT (zaehlt nicht als Arbeit und
// unterbricht die Ruhezeit nicht). Reisezeit wird wie Vollarbeit behandelt
// (dokumentierter Default; abweichende Verguetung ueber das Lohnartenmapping).
const d = (iso: string): Date => new Date(iso);
const tz = 'Europe/Berlin';
const pkg = selectRulePackage(DEFAULT_RULE_PACKAGES, '2026-07-06');
const NOW = d('2026-07-31T12:00:00Z');

function ev(kind: StampEvent['kind'], at: string, workKind?: StampEvent['workKind']): StampEvent {
  return { kind, at: d(at), ...(workKind ? { workKind } : {}) };
}

describe('C-09: Bewertungsart haengt an der Schicht (clock_in)', () => {
  it('foldShifts uebernimmt die Art des clock_in; Default ist Vollarbeit', () => {
    const shifts = foldShifts([
      ev('clock_in', '2026-07-06T06:00:00Z', 'on_call_duty'),
      ev('clock_out', '2026-07-06T12:00:00Z'),
      ev('clock_in', '2026-07-07T06:00:00Z'),
      ev('clock_out', '2026-07-07T12:00:00Z'),
    ]);
    expect(shifts[0]!.workKind).toBe('on_call_duty');
    expect(shifts[1]!.workKind).toBe('full_work');
  });
});

describe('C-09: Bereitschaftsdienst ist ARBEITSZEIT (ArbZG)', () => {
  it('11 h Bereitschaftsdienst zaehlen voll und verletzen die Hoechstarbeitszeit', () => {
    const days = buildAccountingDays(
      [
        ev('clock_in', '2026-07-06T05:00:00Z', 'on_call_duty'), // 07:00 lokal
        ev('clock_out', '2026-07-06T16:00:00Z'), // 18:00 lokal
      ],
      tz,
      pkg,
      NOW,
    );
    expect(days[0]!.workedMinutes).toBe(660);
    expect(days[0]!.findings.map((f) => f.code)).toContain('MAX_DAILY_WORKTIME_EXTENDED_EXCEEDED');
  });
});

describe('C-09: Rufbereitschaft ist RUHEZEIT', () => {
  const events = [
    // Mo: Vollarbeit bis 20:00 lokal.
    ev('clock_in', '2026-07-06T09:00:00Z'),
    ev('clock_out', '2026-07-06T18:00:00Z'),
    // Mo-Abend: Rufbereitschaft 22:00-23:00 lokal.
    ev('clock_in', '2026-07-06T20:00:00Z', 'standby'),
    ev('clock_out', '2026-07-06T21:00:00Z'),
    // Di: Wiederantritt 07:00 lokal = exakt 11 h nach 20:00.
    ev('clock_in', '2026-07-07T05:00:00Z'),
    ev('clock_out', '2026-07-07T13:00:00Z'),
  ];

  it('zaehlt nicht als Arbeitszeit, wird aber getrennt ausgewiesen', () => {
    const days = buildAccountingDays(events, tz, pkg, NOW);
    expect(days[0]!.workedMinutes).toBe(540); // nur die Vollarbeit
    expect(days[0]!.standbyMinutes).toBe(60);
  });

  it('unterbricht die Ruhezeit NICHT: 11 h ab Ende der Vollarbeit sind eingehalten', () => {
    const days = buildAccountingDays(events, tz, pkg, NOW);
    const codes = days.flatMap((day) => day.findings.map((f) => f.code));
    expect(codes).not.toContain('REST_PERIOD_TOO_SHORT');
  });

  it('Gegenprobe: dieselbe Abendschicht als VOLLARBEIT verkuerzt die Ruhe (8 h) -> Verstoss', () => {
    const fullWorkEvening = events.map((e, i) =>
      i === 2 ? ev('clock_in', '2026-07-06T20:00:00Z') : e,
    );
    const days = buildAccountingDays(fullWorkEvening, tz, pkg, NOW);
    const codes = days.flatMap((day) => day.findings.map((f) => f.code));
    expect(codes).toContain('REST_PERIOD_TOO_SHORT');
  });
});

describe('C-09: Reisezeit wird wie Vollarbeit behandelt (dokumentierter Default)', () => {
  it('Reisezeit zaehlt in die Arbeitszeit', () => {
    const days = buildAccountingDays(
      [
        ev('clock_in', '2026-07-06T06:00:00Z', 'travel'),
        ev('clock_out', '2026-07-06T10:00:00Z'),
      ],
      tz,
      pkg,
      NOW,
    );
    expect(days[0]!.workedMinutes).toBe(240);
  });
});
